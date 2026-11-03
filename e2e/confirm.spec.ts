// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';

/** The page never scrolls sideways: a long rule or path wraps, on a phone as on a desk. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow: unknown = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('an admin reads the exact change a CLI token asked for, before and after, and confirms it', async ({
  page,
}, testInfo) => {
  await page.goto('/confirm/gc-self-approval');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Never let the person who asks approve their own request',
  );
  await expect(page.getByText(/^expires in 1[34]:\d\d$/)).toBeVisible();
  await expect(
    page.getByText('If you did not run this command yourself, refuse: an agent may have asked for it.'),
  ).toBeVisible();
  const what = page.getByRole('region', { name: 'What it changes' });
  await expect(what).toContainText('PUT /api/v1/gates/policy');
  await expect(what).toContainText('gates:policy');
  await expect(page.getByRole('region', { name: 'Who asks' })).toContainText('ostrom login --admin');

  const before = page.getByRole('figure', { name: 'Before' });
  const after = page.getByRole('figure', { name: 'After' });
  await expect(before.locator('del')).toHaveText('"selfApproval": "sole-approver"');
  await expect(after.locator('ins')).toHaveText('"selfApproval": "never"');
  // Side by side on a desk, stacked on a phone.
  const left = await before.boundingBox();
  const right = await after.boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  if (testInfo.project.name === 'mobile')
    expect(right?.y).toBeGreaterThan((left?.y ?? 0) + (left?.height ?? 0));
  else expect(right?.y).toBe(left?.y);
  await expectNoSidewaysScroll(page);

  const confirm = page.getByRole('button', { name: 'Confirm the change' });
  await expect(confirm).toBeInViewport();
  await confirm.click();
  const outcome = page.getByRole('region', { name: 'Outcome' });
  await expect(outcome).toContainText('Confirmed and written');
  await expect(outcome).toContainText('Maya Lind (maya) confirmed this change');
  await outcome.getByText('What the write returned').click();
  await expect(outcome).toContainText('"selfApproval": "never"');
  await expect(page.getByRole('button', { name: 'Confirm the change' })).toHaveCount(0);
});

test('a change of the people reads in words: who, which role, who asked; then it is confirmed', async ({
  page,
}) => {
  await page.goto('/confirm/gc-member-role');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make theo an admin of Acme');
  const change = page.getByRole('region', { name: 'Who and which role' });
  await expect(change).toContainText('theo');
  await expect(change).toContainText('Member → Admin');
  await expect(page.getByRole('region', { name: 'Before and after' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'What it changes' })).toContainText('Change a member’s role');
  await expect(page.getByRole('region', { name: 'Who asks' })).toContainText('lena');
  await expectNoSidewaysScroll(page);

  await page.goto('/confirm/gc-member-invite');
  const invited = page.getByRole('region', { name: 'Who is invited' });
  await expect(invited).toContainText('ana@acme.dev');
  await expect(invited).toContainText('Approver');
  await expect(invited).toContainText('bo@acme.dev');
  await expectNoSidewaysScroll(page);

  const confirm = page.getByRole('button', { name: 'Confirm the change' });
  await expect(confirm).toBeInViewport();
  await confirm.click();
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText('Confirmed and written');
});

test('refusing goes by keyboard, and a creation shows nothing before', async ({ page }) => {
  await page.goto('/confirm/gc-rule-new');
  await expect(page.getByText('Nothing: this change creates it.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Who asks' })).toContainText('ostrom login');
  const refuse = page.getByRole('button', { name: 'Refuse' });
  await refuse.focus();
  await expect(refuse).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Confirm the change' })).toBeFocused();
  await refuse.focus();
  await page.keyboard.press('Enter');
  const outcome = page.getByRole('region', { name: 'Outcome' });
  await expect(outcome).toContainText('Refused');
  await expect(outcome).toContainText('Nothing was written.');
});

test('a confirm from a sign-in more than five minutes old asks to sign in again, then comes back and goes through', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/confirm/gc-self-approval');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The demo signed in when it opened: six minutes later, a confirm needs a fresh sign-in, as a yes does.
  await page.clock.fastForward('06:00');
  await page.getByRole('button', { name: 'Confirm the change' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Confirming needs a sign-in of less than five minutes.');
  await alert.getByRole('link', { name: 'Sign in again' }).click();
  await expect(page).toHaveURL(/\/signin\?redirect=%2Fconfirm%2Fgc-self-approval$/);

  await page.getByRole('textbox', { name: 'Your e-mail address' }).fill('maya@acme.dev');
  await page.getByRole('button', { name: 'E-mail me a link' }).click();
  // The link opened in this page, without a reload: the demo keeps its data and only its sign-in is new.
  await page.evaluate(
    "history.pushState({}, '', '/auth/email#token=ml_demo'); dispatchEvent(new PopStateEvent('popstate'))",
  );
  // Someone is signed in (the old session): the link replaces it after a yes.
  await page.getByRole('button', { name: 'Sign in with the link' }).click();
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await page.evaluate(
    "history.pushState({}, '', '/confirm/gc-self-approval'); dispatchEvent(new PopStateEvent('popstate'))",
  );
  await page.getByRole('button', { name: 'Confirm the change' }).click();
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText('Confirmed and written');
});

test('a stale change writes nothing, and a confirmation not in this organization is not found', async ({
  page,
}) => {
  await page.goto('/confirm/gc-models-stale');
  await page.getByRole('button', { name: 'Confirm the change' }).click();
  await expect(page.getByRole('alert')).toContainText('nothing was written');
  await expect(page.getByRole('region', { name: 'Outcome' })).toContainText('Confirmed, but not written');

  await page.goto('/confirm/gc-elsewhere');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirmation not found');
});

test('reads in the dark theme with the same structure', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/confirm/gc-workflow-drop');
  await expect(page.getByText('Nothing: this change deletes it.')).toBeVisible();
  // The night ink, not the day's paper.
  await expect(page.locator('body')).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expectNoSidewaysScroll(page);
});
