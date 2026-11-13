// SPDX-License-Identifier: Apache-2.0
// The navigation against the real server, signed in: the bar on a wide screen; on a phone, the menu, a modal sheet
// that axe finds nothing wrong with, whose focus goes round inside it, that Escape closes, and that opens a screen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { freshEmail, signIn } from './real';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the console’s navigation, the bar on a wide screen and the menu on a phone', async ({
  page,
  isMobile,
}) => {
  await signIn(page, freshEmail('nora'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  const bar = page.getByRole('navigation', { name: 'Main' });
  const button = page.getByRole('button', { name: 'Menu' });
  if (!isMobile) {
    await expect(bar.getByRole('link', { name: 'Sessions', exact: true })).toBeVisible();
    await expect(button).toBeHidden();
    await bar.getByRole('link', { name: 'Sessions', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sessions');
    return;
  }

  await expect(bar).toBeHidden();
  await button.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeFocused();
  await expect(menu.getByRole('link', { name: 'Requests' })).toHaveAttribute('aria-current', 'page');
  const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const broken = axe.violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(broken).toEqual([]);

  // More Tabs than the sheet has stops: the focus never leaves it.
  for (let step = 0; step < 30; step += 1) await page.keyboard.press('Tab');
  await expect(page.locator('.o-nav-menu__panel :focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await menu.getByRole('link', { name: 'Sessions', exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sessions');
});
