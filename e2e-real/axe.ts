// SPDX-License-Identifier: Apache-2.0
// axe against WCAG 2.2 A and AA, and the table of what it finds, shared by the journeys that check screens with it.
import AxeBuilder from '@axe-core/playwright';
import { appendFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** What axe finds on the page as it is: one line per element and rule broken. */
export async function violationsOn(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} (${violation.impact ?? 'unknown'}) ${node.target.join(' ')}`,
    ),
  );
}

/**
 * Attaches the table of what axe found on each screen, prints it in the log and the run's summary, then expects
 * nothing on every screen: each failing one is named, its elements in the table.
 */
export async function expectNoViolations(
  title: string,
  scheme: 'light' | 'dark',
  found: ReadonlyMap<string, readonly string[]>,
): Promise<void> {
  const rows = [...found].map(([path, lines]) => {
    const rules = [...new Set(lines.map((line) => line.split(' ')[0] ?? ''))].join(', ');
    return `| \`${path}\` | ${String(lines.length)} | ${rules} |`;
  });
  const total = [...found.values()].reduce((sum, lines) => sum + lines.length, 0);
  const what = `${title}, ${scheme}, ${test.info().project.name}`;
  const table = [
    `### axe, WCAG 2.2 A and AA, ${what}: ${String(total)} violations`,
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
  await test.info().attach(`a11y-${title}-${scheme}.md`, { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  console.warn(table);
  for (const [path, lines] of found) expect.soft(lines, `${path} in ${scheme}`).toEqual([]);
}
