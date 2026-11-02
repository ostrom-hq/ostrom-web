// SPDX-License-Identifier: AGPL-3.0-only
// What each screen asks the server when it loads from scratch (a full page load, as from a link or a reload): how
// many calls, whether any is asked twice, and how deep the chain of calls waiting on one another goes (a waterfall:
// a call that starts only once another has answered).
import { appendFileSync } from 'node:fs';
import { expect, type Page, type Request, test } from '@playwright/test';
import { ownerOfNewOrganization } from './real';

/** The console's screens, as a person opens them from the menu or a link. */
const screens = [
  '/',
  '/yes',
  '/sessions',
  '/receipts',
  '/members',
  '/approvers',
  '/rules',
  '/activity',
  '/decisions',
  '/workflows',
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
  '/github',
] as const;

interface Call {
  readonly name: string;
  readonly start: number;
  /** When its answer had arrived; never, for a stream still open. */
  readonly end: number;
}

/** The calls to the API a full load of `path` makes, until none has started for a second and a half. */
async function callsOnLoad(page: Page, path: string): Promise<Call[]> {
  const started = new Map<Request, number>();
  const ended = new Map<Request, number>();
  const onRequest = (request: Request): void => {
    if (new URL(request.url()).pathname.startsWith('/api/')) started.set(request, performance.now());
  };
  const onEnd = (request: Request): void => {
    if (started.has(request)) ended.set(request, performance.now());
  };
  page.on('request', onRequest);
  page.on('requestfinished', onEnd);
  page.on('requestfailed', onEnd);
  try {
    await page.goto(path);
    let seen = -1;
    while (seen !== started.size) {
      seen = started.size;
      await page.waitForTimeout(1500);
    }
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onEnd);
    page.off('requestfailed', onEnd);
  }
  return [...started].map(([request, start]) => {
    const url = new URL(request.url());
    return {
      name: `${request.method()} ${url.pathname}${url.search}`,
      start,
      end: ended.get(request) ?? Number.POSITIVE_INFINITY,
    };
  });
}

/** The longest chain of calls each started only after the one before had answered (1: all at once). */
function depthOf(calls: readonly Call[]): number {
  const sorted = calls.toSorted((a, b) => a.start - b.start);
  const depths: number[] = [];
  sorted.forEach((call, index) => {
    let deepest = 0;
    for (let before = 0; before < index; before += 1) {
      const earlier = sorted[before];
      if (earlier !== undefined && earlier.end <= call.start)
        deepest = Math.max(deepest, depths[before] ?? 0);
    }
    depths.push(deepest + 1);
  });
  return Math.max(0, ...depths);
}

function twiceIn(calls: readonly Call[]): string[] {
  const names = calls.map((call) => call.name);
  return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
}

test('what each screen asks the server when it loads', async ({ page }) => {
  test.setTimeout(180_000);
  await ownerOfNewOrganization(page, 'ada');

  const rows = ['| Screen | Calls | Depth | Asked twice | Calls in order |', '|---|---:|---:|---|---|'];
  for (const screen of screens) {
    const calls = await callsOnLoad(page, screen);
    const ordered = calls.toSorted((a, b) => a.start - b.start).map((call) => `\`${call.name}\``);
    rows.push(
      `| \`${screen}\` | ${String(calls.length)} | ${String(depthOf(calls))} | ${twiceIn(calls).join(', ')} | ${ordered.join(' ')} |`,
    );
  }
  const table = `### API calls on load (${test.info().project.name})\n\n${rows.join('\n')}\n`;
  await test.info().attach('api-calls-on-load.md', { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  expect(rows.length).toBe(screens.length + 2);
});
