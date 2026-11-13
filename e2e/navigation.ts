// SPDX-License-Identifier: Apache-2.0
import type { Page } from '@playwright/test';

/** The widest screen that shows the menu rather than the bar (shell.css, `max-width: 640px`). */
const PHONE_MAX_WIDTH = 640;

/** Opens a screen from the console's navigation: the bar on a wide screen, the menu on a phone. */
export async function openScreen(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY;
  if (width <= PHONE_MAX_WIDTH) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name, exact: true }).click();
    return;
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
}
