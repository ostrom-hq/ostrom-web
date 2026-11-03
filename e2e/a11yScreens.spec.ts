// SPDX-License-Identifier: AGPL-3.0-only
// Every screen of the console's navigation, checked by axe against WCAG 2.2 A and AA, in the light and the dark theme,
// on a wide screen and a phone, filled with the demo data: the badges, tables and lists a new organization on the real
// server does not have yet (e2e-real/a11yScreens.spec.ts checks those empty states). The table of what axe finds is
// attached to the run and printed in its log. A screen in CHECKED must have nothing; the others are measured only,
// until their pull request fixes them and adds them here.
import AxeBuilder from '@axe-core/playwright';
import { appendFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The screens of the navigation (src/app/navigation.ts), each with its first-level title. */
const SCREENS = [
  '/',
  '/yes',
  '/sessions',
  '/receipts',
  '/members',
  '/github',
  '/workflows',
  '/approvers',
  '/rules',
  '/activity',
  '/decisions',
  '/audit',
  '/policy',
  '/mcp',
  '/secrets',
  '/import',
  '/spend',
  '/billing',
  '/settings',
  '/tokens',
  '/cloud',
  '/automations',
  '/artifacts',
  '/accounts',
  '/signin',
] as const;

/** The screens fixed so far: axe must find nothing on them. */
const CHECKED: ReadonlySet<string> = new Set(['/yes']);

/** What axe finds on the page as it is: one line per element and rule broken. */
async function violationsOn(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} (${violation.impact ?? 'unknown'}) ${node.target.join(' ')}`,
    ),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every screen of the navigation, ${scheme}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const found = new Map<string, string[]>();
    for (const path of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // What the screen reads comes in after its title: a moment for it, then axe.
      await page.waitForTimeout(1_000);
      found.set(path, await violationsOn(page));
    }
    const rows = [...found].map(([path, lines]) => {
      const rules = [...new Set(lines.map((line) => line.split(' ')[0] ?? ''))].join(', ');
      return `| \`${path}\` | ${String(lines.length)} | ${rules} |`;
    });
    const total = [...found.values()].reduce((sum, lines) => sum + lines.length, 0);
    const table = [
      `### axe, WCAG 2.2 A and AA, ${scheme}, ${test.info().project.name}: ${String(total)} violations`,
      '',
      '| Screen | Violations | Rules |',
      '|---|---:|---|',
      ...rows,
      '',
      '<details><summary>Each element</summary>',
      '',
      ...[...found].flatMap(([path, lines]) => lines.map((line) => `- \`${path}\` ${line}`)),
      '',
      '</details>',
      '',
    ].join('\n');
    await test.info().attach(`a11y-${scheme}.md`, { body: table, contentType: 'text/markdown' });
    const summary = process.env['GITHUB_STEP_SUMMARY'];
    if (summary !== undefined) appendFileSync(summary, table);
    console.warn(table);
    for (const path of CHECKED) expect(found.get(path), `${path} in ${scheme}`).toEqual([]);
  });
}
