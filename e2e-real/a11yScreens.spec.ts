// SPDX-License-Identifier: Apache-2.0
// Every screen of the console's navigation, checked by axe against WCAG 2.2 A and AA, in the light and the dark theme,
// on a wide screen and a phone, against the real server, signed in as the owner of a new organization. The table of
// what axe finds is attached to the run, and printed in its log; every screen must have nothing.
import { expect, test } from '@playwright/test';
import { expectNoViolations, violationsOn } from './axe';
import { ownerOfNewOrganization } from './real';

/** The screens of the navigation (src/app/navigation.ts), each with its first-level title. */
const SCREENS = [
  '/',
  '/yes',
  '/sessions',
  '/receipts',
  '/members',
  '/github',
  '/workflows',
  '/runs',
  '/approvers',
  '/rules',
  '/activity',
  '/decisions',
  '/audit',
  '/policy',
  '/mcp',
  '/secrets',
  '/environment',
  '/me/environment',
  '/me/mcp',
  '/me/notifications',
  '/skills',
  '/hooks',
  '/import',
  '/spend',
  '/billing',
  '/settings',
  '/tokens',
  '/cloud',
  '/automations',
  '/artifacts',
  '/accounts',
  // Reached by the tab of the shared accounts, not the navigation (web#97).
  '/accounts/groups',
  '/signin',
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`every screen of the navigation, ${scheme}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await ownerOfNewOrganization(page, `axe${scheme}`);
    const found = new Map<string, string[]>();
    for (const path of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // What the screen reads comes in after its title: a moment for it, then axe.
      await page.waitForTimeout(1_000);
      found.set(path, await violationsOn(page));
    }
    // Measured clean on every screen (web#87): each must stay so, its own table attached when it does not.
    await expectNoViolations('navigation', scheme, found);
  });
}
