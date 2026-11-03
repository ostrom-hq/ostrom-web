// SPDX-License-Identifier: AGPL-3.0-only
// The console's navigation: the bar on a wide screen; on a phone, where the bar has no room, a menu that is a modal
// sheet (the focus stays in it, Escape and Close shut it, the focus comes back to its button).
import { expect, test } from '@playwright/test';

test('a wide screen shows every screen in the bar, and no menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone shows the menu');
  await page.goto('/yes');
  const bar = page.getByRole('navigation', { name: 'Main' });
  await expect(bar.getByRole('link', { name: 'Sessions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
});

test('a phone opens every screen from the menu, its focus held until it closes', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'a wide screen shows the bar');
  await page.goto('/yes');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  const button = page.getByRole('button', { name: 'Menu' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeFocused();
  await expect(menu.getByRole('link')).toHaveCount(25);
  await expect(menu.getByRole('link', { name: 'Requests' })).toHaveAttribute('aria-current', 'page');
  // The focus goes round the sheet: past its last link, nothing of the console behind it takes it.
  for (let step = 0; step < 30; step += 1) await page.keyboard.press('Tab');
  await expect(page.locator('.o-nav-menu__panel :focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await menu.getByRole('button', { name: 'Close' }).click();
  await expect(menu).toBeHidden();

  await button.click();
  await menu.getByRole('link', { name: 'Sessions', exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sessions');
});
