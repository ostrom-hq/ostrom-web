import { expect, test } from '@playwright/test';

test('the console opens on the home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Ostrom');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the theme switch cycles system, light, dark, and a pinned theme survives a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await page.getByRole('button', { name: 'Theme: system. Switch to light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Theme: light. Switch to dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Theme: dark. Switch to system' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('an unknown address shows the not-found page', async ({ page }) => {
  await page.goto('/nowhere');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeVisible();
});
