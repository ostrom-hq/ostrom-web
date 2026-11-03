// SPDX-License-Identifier: AGPL-3.0-only
// The console's key journeys with the keyboard alone, against the real server: signing in, saying yes and no to a
// request, writing a rule, setting a budget, and leaving for Stripe's Checkout. Each control is reached with Tab and
// used with Enter, Space or typing, never a click; every stop on the way shows where the focus is (an outline or a
// ring), which axe does not check.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { askingToken, askPushToMain, gatedRepository, loginOf, requestOf } from './gate';
import { addressOfAPerson, callFromPage, freshEmail, signInToken } from './real';

/** Tab stops a screen may take before its control: the navigation and the header come first. */
const MAX_TABS = 80;

/** What is wrong with the focused element's focus indicator, or '' when it shows. */
async function focusProblem(page: Page): Promise<string> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === document.body) return 'the focus is on nothing';
    const style = getComputedStyle(focused);
    const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    const ring = style.boxShadow !== 'none';
    if (outline || ring) return '';
    const name = focused.getAttribute('aria-label') ?? focused.innerText.trim().slice(0, 40);
    return `${focused.tagName.toLowerCase()} "${name}" shows no focus`;
  });
}

/**
 * Presses Tab until `target` has the focus, noting every stop without a visible focus in `unseen`. Fails when it
 * never comes: the control is out of the keyboard's reach.
 */
async function tabTo(page: Page, target: Locator, unseen: Set<string>): Promise<void> {
  await expect(target).toBeVisible({ timeout: 30_000 });
  for (let step = 0; step < MAX_TABS; step += 1) {
    await page.keyboard.press('Tab');
    const problem = await focusProblem(page);
    if (problem !== '') unseen.add(`${new URL(page.url()).pathname}: ${problem}`);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`${String(MAX_TABS)} presses of Tab never reached ${target.toString()}`);
}

test('the key journeys with the keyboard alone, every stop with a visible focus', async ({ page }) => {
  test.setTimeout(300_000);
  const unseen = new Set<string>();

  // Signing in: the e-mail typed and sent with Enter.
  await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': addressOfAPerson() });
  const email = freshEmail('keys');
  await page.goto('/signin?redirect=%2Fyes');
  const address = page.getByRole('textbox', { name: 'Your e-mail address' });
  await tabTo(page, address, unseen);
  await page.keyboard.type(email);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText(`If ${email} may sign in, a link is on its way.`);
  let token: string | undefined;
  await expect
    .poll(() => {
      token = signInToken(email);
      return token;
    })
    .toBeDefined();
  // The e-mailed link: opened as the mail client does, then the console's own screen.
  await page.goto(`/auth/email#token=${encodeURIComponent(token ?? '')}`);
  await expect.poll(() => new URL(page.url()).pathname).toBe('/yes');
  const created = await callFromPage(page, 'POST', '/api/v1/orgs', {
    name: `keys ${Date.now().toString(36)}`,
  });
  expect(created.status).toBe(201);
  const org = z.object({ id: z.string() }).parse(created.body).id;

  // Yes and no on `/yes/$approvalId`: the only approver may approve what they asked, as the receipt says.
  const policy = await callFromPage(
    page,
    'PUT',
    '/api/v1/gates/policy',
    { selfApproval: 'sole-approver' },
    org,
  );
  expect(policy.status, JSON.stringify(policy.body)).toBe(200);
  const asking = await askingToken(page, org);
  const repo = await gatedRepository(page, org, [await loginOf(page)]);
  const yes = await requestOf(page, org, await askPushToMain(asking, org, repo));
  const no = await requestOf(page, org, await askPushToMain(asking, org, repo));

  await page.goto('/yes');
  await tabTo(page, page.locator(`a[href$="/yes/${yes.id}"]`).first(), unseen);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/yes/${yes.id}$`));
  await tabTo(page, page.getByRole('button', { name: /^Approve/ }), unseen);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(`approved: ${yes.title}`);

  await page.goto(`/yes/${no.id}`);
  await tabTo(page, page.getByRole('button', { name: 'Decline & tell the agent…' }), unseen);
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('textbox', { name: 'What should the agent do instead?' }), unseen);
  await page.keyboard.type('Wait for the migration, then ask again.');
  await tabTo(page, page.getByRole('button', { name: 'Decline and send' }), unseen);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(`declined: ${no.title}`);

  // A rule: the form opened, written, sent.
  await page.goto('/rules');
  await tabTo(page, page.getByRole('button', { name: 'New rule' }), unseen);
  await page.keyboard.press('Enter');
  const form = page.getByRole('region', { name: 'A new rule' });
  const statement = `Read the runbook before a deploy (${Date.now().toString(36)}).`;
  await tabTo(page, form.getByRole('textbox', { name: 'Rule' }), unseen);
  await page.keyboard.type(statement);
  await tabTo(page, form.getByRole('button', { name: 'Add the rule' }), unseen);
  await page.keyboard.press('Enter');
  await expect(page.locator('article').filter({ hasText: statement })).toBeVisible();

  // A budget: the organization's, by the month, that stops the agents.
  await page.goto('/spend');
  const budget = page.getByRole('region', { name: 'Set a budget' });
  await tabTo(page, budget.getByRole('textbox', { name: 'Per month ($)' }), unseen);
  await page.keyboard.type('100');
  await tabTo(
    page,
    budget.getByRole('checkbox', { name: 'Stop the agents at the limit (otherwise, warn only)' }),
    unseen,
  );
  await page.keyboard.press('Space');
  await tabTo(page, budget.getByRole('button', { name: 'Save the budget' }), unseen);
  await page.keyboard.press('Enter');
  await expect(budget.getByRole('combobox', { name: 'For' })).toHaveValue('org');
  const orgLine = page
    .getByRole('region', { name: 'Budgets' })
    .getByRole('listitem')
    .filter({ hasText: 'The organization' });
  await expect(orgLine).toContainText('$100.00 a month');
  await expect(orgLine).toContainText('Stops');

  // Billing: Team chosen, the browser leaves for Stripe's Checkout (a stand-in: the journey never reaches Stripe).
  await page.route('https://checkout.stripe.com/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Stripe Checkout (test)</title>' });
  });
  await page.goto('/billing');
  const team = page.getByRole('region', { name: 'Plans' }).getByRole('button', { name: 'Choose Team' });
  await tabTo(page, team, unseen);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });

  expect([...unseen], 'every Tab stop shows where the focus is').toEqual([]);
});
