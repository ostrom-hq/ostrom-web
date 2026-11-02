// SPDX-License-Identifier: AGPL-3.0-only
import { expect, type Page, test } from '@playwright/test';

/*
 * S2-09: the preview server sends the console image's own headers (vite.config.ts reads
 * docker/security-headers.conf), so every journey runs under the Content-Security-Policy the image ships.
 */

/** Every CSP violation across navigations, from the console lines of Chromium and of our listener. */
function watchViolations(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) seen.push(message.text());
  });
  return () => seen;
}

test('the console is served with its security headers', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  const csp = headers['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self'(;|$)/);
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('the console works under its Content-Security-Policy without a single violation', async ({ page }) => {
  const violations = watchViolations(page);
  // Init scripts are not subject to the page's CSP: this listener reports what the policy blocked. A string, as
  // the e2e project is typed without the DOM library.
  await page.addInitScript({
    content: `document.addEventListener('securitypolicyviolation', (event) => {
      const what = event.effectiveDirective + ' blocked ' + event.blockedURI;
      console.error('Content Security Policy violation: ' + what);
    });`,
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Demo data');
  // The theme pinned before the first paint comes from /theme.js, the script that replaced the inline one.
  await page.getByRole('button', { name: 'Theme: system. Switch to light' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/nowhere');
  await expect(page.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeVisible();
  expect(violations()).toEqual([]);
});
