// SPDX-License-Identifier: AGPL-3.0-only
// The screens of the yes, checked by axe against WCAG 2.2 A and AA in each state an approver meets them in, in the
// light and the dark theme: an approver on a phone, answering a link, must be able to read and reach everything.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** What axe finds on the page as it is now: each rule broken, with the elements that break it. */
async function violationsOn(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  // Each element with its markup and axe's reason (the colours and ratio, the name and the text), cut short.
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${node.html.slice(0, 160)} — ${(node.failureSummary ?? '').replaceAll('\n', ' ').slice(0, 240)}`,
    ),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`the yes screens, ${scheme}`, () => {
    test.beforeEach(async ({ page }) => {
      // No transition or entry animation mid-way: axe reads the colours as they settle.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    });

    test('the queue of requests', async ({ page }) => {
      await page.goto('/yes');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
      await expect(page.getByRole('link', { name: /Merge PR #412 into main/ })).toBeVisible();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('a request waiting for a yes, its proof shown', async ({ page }) => {
      await page.goto('/yes/apr-merge-412');
      await expect(page.getByText('fix(invoices): round VAT per line')).toBeVisible();
      await expect(page.getByRole('button', { name: /^Approve/ })).toBeVisible();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('the approve button under the pointer', async ({ page, isMobile }) => {
      test.skip(isMobile, 'a touch screen has no pointer over a button');
      await page.goto('/yes/apr-merge-412');
      const approve = page.getByRole('button', { name: /^Approve/ });
      // Under the pointer, with motion reduced: the hover colour is on at once, and axe reads the white on it.
      await approve.hover();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('the navigation menu open on a phone', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'a wide screen shows the bar, not the menu');
      await page.goto('/yes');
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Requests' }),
      ).toBeVisible();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('the organization switch under the pointer and with the focus', async ({ page, isMobile }) => {
      await page.goto('/yes');
      const sw = page.getByRole('button', { name: /^Organization: / });
      await expect(sw).toBeVisible();
      if (!isMobile) {
        await sw.hover();
        expect(await violationsOn(page)).toEqual([]);
      }
      await sw.focus();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('a request answered, its receipt open', async ({ page }) => {
      await page.goto('/yes/apr-merge-412');
      await page.getByRole('button', { name: /^Approve/ }).click();
      const decision = page.getByRole('region', { name: 'Decision' });
      await decision.getByText('Verify the receipt').click();
      await expect(decision.getByText('ostrom verify rcpt-apr-merge-412', { exact: true })).toBeVisible();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('a decline being written', async ({ page }) => {
      await page.goto('/yes/apr-deploy-88');
      await page.getByRole('button', { name: 'Decline & tell the agent…' }).click();
      await expect(page.getByRole('textbox', { name: 'What should the agent do instead?' })).toBeVisible();
      expect(await violationsOn(page)).toEqual([]);
    });

    test('a yes refused to the person who asked', async ({ page }) => {
      await page.goto('/yes/apr-deploy-88');
      await page.getByRole('button', { name: /^Approve/ }).click();
      await expect(page.getByRole('alert')).toContainText('You asked for this');
      expect(await violationsOn(page)).toEqual([]);
    });

    test('a sign-in link asked about', async ({ page }) => {
      await page.goto('/yes#signin=opk_e2e_token_123');
      await expect(page.getByRole('alert').filter({ hasText: 'Someone is already signed in' })).toBeVisible();
      expect(await violationsOn(page)).toEqual([]);
    });
  });
}
