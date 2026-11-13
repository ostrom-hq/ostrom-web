// SPDX-License-Identifier: Apache-2.0
// The groups of the shared accounts on the demo data: made, opened and changed by an admin, and checked by axe
// against WCAG 2.2 A and AA in the light and the dark theme, on a wide screen and a phone.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { openScreen } from './navigation';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** The demo's Platform group (src/mocks/fixtures/sharing.ts). */
const PLATFORM = '/accounts/groups/0a1b2c3d-4e5f-4a6b-8c7d-000000000001';

async function violationsOn(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.flatMap((violation) => {
    const rule = `${violation.id} (${violation.impact ?? 'unknown'})`;
    return violation.nodes.map((node) => `${rule}: ${node.target.join(' ')}`);
  });
}

test('an admin makes a group beside the subscriptions, opens it and pauses a member for a week', async ({
  page,
}) => {
  await page.goto('/');
  await openScreen(page, 'Shared subscriptions');
  const tabs = page.getByRole('navigation', { name: 'Shared accounts' });
  await tabs.getByRole('link', { name: 'Groups' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groups' })).toBeVisible();
  const form = page.getByRole('region', { name: 'New group' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Ops');
  await form.getByRole('checkbox', { name: 'theo', exact: true }).check();
  await form.getByRole('checkbox', { name: 'Maya’s Claude Max' }).check();
  await form.getByRole('button', { name: 'Create the group' }).click();
  const ops = page.getByRole('article', { name: 'Ops' });
  await expect(ops).toContainText('Lends Maya’s Claude Max');
  await ops.getByRole('link', { name: 'Ops' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ops' })).toBeVisible();
  const members = page.getByRole('region', { name: 'Members' });
  const theo = members.getByRole('listitem').filter({ hasText: 'theo' });
  await theo.getByRole('button', { name: 'Pause theo' }).click();
  await theo.getByRole('button', { name: 'For a week' }).click();
  await expect(theo).toContainText('Paused until');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`groups and a group, pause choices open, ${scheme}: nothing axe finds`, async ({ page }) => {
    // No transition mid-way: axe reads the colours as they settle.
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/accounts/groups');
    await expect(page.getByRole('article', { name: 'Platform' })).toBeVisible();
    expect(await violationsOn(page)).toEqual([]);
    await page.goto(PLATFORM);
    await expect(page.getByRole('heading', { level: 1, name: 'Platform' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Maya’s Claude Max' })).toBeChecked();
    await page.getByRole('button', { name: 'Pause theo' }).click();
    await expect(page.getByRole('group', { name: 'How long to pause theo' })).toBeVisible();
    expect(await violationsOn(page)).toEqual([]);
  });
}
