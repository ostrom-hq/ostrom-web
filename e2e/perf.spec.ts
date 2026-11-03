// SPDX-License-Identifier: AGPL-3.0-only
// The console's heavy screens on a large organization (src/mocks/fixtures/large.ts: 500 members in 50 groups, 2 000
// rules, 10 000 lines of activity, 300 sessions), on a wide screen and on a phone whose processor is slowed four
// times. For each screen: when its first lines show, how many lines and DOM nodes it holds, how many API calls it
// made, the JavaScript heap after a collection, and the longest interaction (INP) of its filter. The table is attached
// to the run and printed in its summary (PERF-CONSOLE).
import { appendFileSync } from 'node:fs';
import { type CDPSession, expect, type Page, test } from '@playwright/test';

interface Interaction {
  /** What is measured, said in the table. */
  readonly label: string;
  /** Does it, then waits until the screen shows its result. */
  readonly run: (page: Page) => Promise<void>;
}

interface HeavyScreen {
  readonly path: string;
  /** The screen's lines. */
  readonly rows: string;
  readonly filter?: Interaction;
  /** The screen reads again on its own: count its API calls over one period once every page is on screen. */
  readonly pollMs?: number;
}

const SCREENS: readonly HeavyScreen[] = [
  {
    path: '/activity',
    rows: 'main ul.o-rows > li',
    filter: {
      label: 'repository',
      run: async (page) => {
        await page.getByRole('search').getByRole('textbox').fill('acme/service-07');
        await page.getByRole('search').getByRole('textbox').press('Enter');
        await expect(page).toHaveURL(/repo=acme/);
        await expect(page.locator('[aria-busy="false"]')).toBeVisible();
      },
    },
  },
  {
    path: '/rules',
    rows: 'main article.rl-card',
    filter: {
      label: 'All',
      run: async (page) => {
        const all = page.getByRole('button', { name: /^All \d/ });
        await all.click();
        await expect(all).toHaveAttribute('aria-pressed', 'true');
      },
    },
  },
  {
    path: '/members',
    rows: 'section[aria-labelledby="mb-people"] li',
    filter: {
      label: 'search',
      run: async (page) => {
        await page.getByRole('searchbox', { name: 'Find someone' }).fill('Developer 04');
        await expect(page.locator('section[aria-labelledby="mb-people"] li')).toHaveCount(10);
      },
    },
  },
  {
    path: '/accounts/groups',
    rows: 'main article',
    filter: {
      label: 'people of a new group',
      run: async (page) => {
        await page.getByRole('searchbox', { name: 'Find someone' }).fill('dev-42');
        await expect(page.getByRole('group', { name: 'Members' }).getByRole('checkbox')).toHaveCount(10);
      },
    },
  },
  {
    path: '/sessions',
    rows: 'main ul.o-rows > li',
    filter: {
      label: 'every older page',
      run: async (page) => {
        const more = page.getByRole('button', { name: 'Show older sessions' });
        while (await more.isVisible()) {
          await more.click();
          await expect(page.getByRole('button', { name: 'Loading…' })).toHaveCount(0);
        }
      },
    },
    // SESSIONS_POLL_MS, and a second for the calls to land.
    pollMs: 16_000,
  },
  {
    path: '/spend',
    rows: 'main li',
    filter: {
      label: 'period',
      run: async (page) => {
        const week = page.getByRole('button', { name: 'Last 7 days' });
        await week.click();
        await expect(week).toHaveAttribute('aria-pressed', 'true');
      },
    },
  },
];

interface Measure {
  readonly path: string;
  /** From the navigation's start to the first line on screen. */
  readonly firstRowsMs: number;
  readonly rows: number;
  readonly domNodes: number;
  readonly apiCalls: number;
  readonly heapMb: number;
  readonly filter?: {
    readonly label: string;
    readonly inpMs: number;
    readonly doneMs: number;
    /** The screen's lines and DOM nodes once the filter shows its result. */
    readonly rows: number;
    readonly domNodes: number;
  };
  /** API calls over one poll period, every page on screen. */
  readonly pollCalls?: number;
}

/** Collects the Event Timing entries of every interaction, from the page's first script. */
const OBSERVE_INTERACTIONS = `
  window.__interactions = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (entry.interactionId) window.__interactions.push(entry.duration);
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  performance.setResourceTimingBufferSize(10000);
`;

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  return Math.round((used / 1024 / 1024) * 10) / 10;
}

/** The API calls of the page since it opened. */
const API_CALLS =
  "performance.getEntriesByType('resource').filter((entry) => new URL(entry.name).pathname.startsWith('/api/')).length";

async function apiCalls(page: Page): Promise<number> {
  const count: unknown = await page.evaluate(API_CALLS);
  return Number(count);
}

/** The screen's lines and every element of the page. */
async function linesOf(
  page: Page,
  rows: string,
): Promise<{ readonly rows: number; readonly domNodes: number }> {
  const counted: unknown = await page.evaluate(
    `[document.querySelectorAll(${JSON.stringify(rows)}).length, document.getElementsByTagName('*').length]`,
  );
  const [lines, nodes] = Array.isArray(counted) ? counted.map(Number) : [];
  return { rows: lines ?? 0, domNodes: nodes ?? 0 };
}

async function measure(page: Page, cdp: CDPSession, screen: HeavyScreen): Promise<Measure> {
  await page.goto(screen.path, { waitUntil: 'commit' });
  const shown = await page.waitForFunction(
    `document.querySelectorAll(${JSON.stringify(screen.rows)}).length > 0 ? performance.now() : false`,
    undefined,
    { timeout: 60_000 },
  );
  const firstRowsMs = Math.round(Number(await shown.jsonValue()));
  // What the screen reads after its first lines (a second page, the members of a form) comes in now.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_000);
  const counts = { ...(await linesOf(page, screen.rows)), apiCalls: await apiCalls(page) };
  const heap = await heapMb(cdp);
  const base = { path: screen.path, firstRowsMs, ...counts, heapMb: heap };
  if (screen.filter === undefined) return base;
  await page.evaluate('window.__interactions = []');
  const started = Date.now();
  await screen.filter.run(page);
  const doneMs = Date.now() - started;
  // Event Timing reports an interaction once its next frame is painted.
  await page.waitForTimeout(1_000);
  const durations: unknown = await page.evaluate('window.__interactions');
  const inpMs = Array.isArray(durations) ? Math.max(0, ...durations.map(Number)) : 0;
  const after = await linesOf(page, screen.rows);
  const filter = { label: screen.filter.label, inpMs, doneMs, ...after };
  if (screen.pollMs === undefined) return { ...base, filter };
  const before = await apiCalls(page);
  await page.waitForTimeout(screen.pollMs);
  return { ...base, filter, pollCalls: (await apiCalls(page)) - before };
}

function tableOf(project: string, measures: readonly Measure[]): string {
  const rows = measures.map((item) =>
    [
      `\`${item.path}\``,
      item.firstRowsMs,
      item.rows,
      item.domNodes,
      item.apiCalls,
      item.heapMb,
      item.filter === undefined ? '—' : `${item.filter.label}: ${String(item.filter.inpMs)}`,
      item.filter === undefined ? '—' : item.filter.doneMs,
      item.filter === undefined ? '—' : `${String(item.filter.rows)} / ${String(item.filter.domNodes)}`,
      item.pollCalls ?? '—',
    ].join(' | '),
  );
  return [
    `### Large organization, ${project}`,
    '',
    '| Screen | First lines (ms) | Lines | DOM nodes | API calls | JS heap (MB) | Filter INP (ms) | Filter done (ms) | After: lines / nodes | Calls per poll |',
    '|---|---:|---:|---:|---:|---:|---|---:|---:|---:|',
    ...rows.map((row) => `| ${row} |`),
    '',
  ].join('\n');
}

test('the heavy screens on a large organization', async ({ page }) => {
  test.setTimeout(600_000);
  const project = test.info().project.name;
  await page.addInitScript("localStorage.setItem('ostrom.mock.scale', 'large')");
  await page.addInitScript(OBSERVE_INTERACTIONS);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  // The phone: a slower processor, four times, as Lighthouse's mobile run.
  if (project === 'mobile') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const measures: Measure[] = [];
  for (const screen of SCREENS) measures.push(await measure(page, cdp, screen));
  const name = project === 'mobile' ? 'phone, CPU ×4' : 'desktop';
  const table = tableOf(name, measures);
  await test.info().attach(`perf-${project}.json`, {
    body: JSON.stringify(measures, null, 2),
    contentType: 'application/json',
  });
  await test.info().attach(`perf-${project}.md`, { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  console.warn(table);
  for (const item of measures) expect(item.rows, item.path).toBeGreaterThan(0);
});
