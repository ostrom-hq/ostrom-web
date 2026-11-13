// SPDX-License-Identifier: Apache-2.0
// How soon the yes screens show on a slow phone network, against the real server: the queue of requests (`/yes`) and
// one request (`/yes/$approvalId`), each loaded cold (no cache) on Lighthouse's slow 4G with a CPU four times slower.
// Chromium only: the network and the CPU are slowed through the DevTools protocol.
import { appendFileSync } from 'node:fs';
import { type CDPSession, expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { askingToken, askPushToMain, gatedRepository, loginOf, requestOf } from './gate';
import { ownerOfNewOrganization } from './real';

/** Lighthouse's slow 4G: 150 ms a round trip, 1.6 Mbit/s down, 750 kbit/s up. */
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
} as const;
const CPU_SLOWDOWN = 4;
/** Each screen is loaded this many times; the median is kept. */
const LOADS = 3;
/**
 * The yes screens show what they are for within this, median, on the line above: about 1.95 s measured (web#75), the
 * rest is the runners' noise. A screen back behind a second round trip (2.4 s and more) or a heavier first download
 * crosses it before long, and every journey run says so.
 */
const READY_BUDGET_MS = 3_000;

interface Load {
  /** First contentful paint, ms from the navigation (-1: none yet). */
  readonly firstPaint: number;
  /** Largest contentful paint so far, ms from the navigation. */
  readonly largestPaint: number;
  /** When what the screen is for is on it: the request's line, or the yes button. */
  readonly ready: number;
  /** Scripts and styles as they came over the network, KiB. */
  readonly sentKiB: number;
}

/** The page's network and CPU slowed down, and its cache off: every load is a first visit. */
async function slowed(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  return cdp;
}

/** Where the page keeps what it measured (the script below). */
const MEASURED = '__ostromFirstPaint';

/**
 * Measures in the page, from its first script on: the console's CSP forbids evaluating a string in it, but a script
 * added before the document runs anyway (Playwright's init script, through the DevTools protocol). At each frame it
 * notes when each selector first matches; the largest paint comes from an observer. A paint not reported is -1.
 */
function measuring(selectors: readonly string[]): string {
  return `(() => {
  const wanted = ${JSON.stringify(selectors)};
  const found = {};
  let largestPaint = -1;
  new PerformanceObserver((list) => {
    largestPaint = list.getEntries().at(-1)?.startTime ?? largestPaint;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  const look = () => {
    for (const selector of wanted)
      if (!(selector in found) && document.querySelector(selector) !== null) found[selector] = performance.now();
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
  Object.defineProperty(globalThis, ${JSON.stringify(MEASURED)}, {
    get: () => ({
      found,
      largestPaint,
      firstPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1,
      sent: performance
        .getEntriesByType('resource')
        .filter((entry) => /\\.(?:js|css)$/.test(new URL(entry.name).pathname))
        .reduce((total, entry) => total + entry.transferSize, 0),
    }),
  });
})();`;
}

const zMeasured = z.object({
  found: z.record(z.string(), z.number()),
  largestPaint: z.number(),
  firstPaint: z.number(),
  sent: z.number(),
});

/** What the page measured so far; nothing before its first script ran. */
async function measuredOn(page: Page): Promise<z.infer<typeof zMeasured> | undefined> {
  const measured = zMeasured.safeParse(
    await page.evaluate((key): unknown => Reflect.get(globalThis, key), MEASURED),
  );
  return measured.success ? measured.data : undefined;
}

/** Loads `path` cold and reads its paints once `selector` is on the page. */
async function load(page: Page, path: string, selector: string): Promise<Load> {
  await page.goto(path, { waitUntil: 'commit' });
  let ready: number | undefined;
  // Read from the test now and then; the time is the page's own, taken at the frame the selector first matched.
  await expect
    .poll(
      async () => {
        ready = (await measuredOn(page))?.found[selector];
        return ready;
      },
      { timeout: 60_000, intervals: [250] },
    )
    .toBeDefined();
  // The largest paint is final once the page is ready and painted once more.
  await page.waitForTimeout(500);
  const measured = await measuredOn(page);
  return {
    firstPaint: measured?.firstPaint ?? -1,
    largestPaint: measured?.largestPaint ?? -1,
    ready: ready ?? -1,
    sentKiB: (measured?.sent ?? 0) / 1024,
  };
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function ms(value: number): string {
  return value < 0 || Number.isNaN(value) ? 'n/a' : `${String(Math.round(value))} ms`;
}

test('the yes screens on a slow 4G phone network', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the network and the CPU are slowed through the DevTools protocol');
  test.setTimeout(300_000);
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  // A request waiting for this person's yes: the queue lists it, and its screen shows the yes button.
  const repo = await gatedRepository(page, org, [await loginOf(page)]);
  const gate = await askPushToMain(await askingToken(page, org), org, repo);
  const request = await requestOf(page, org, gate);

  const screens = [
    { name: 'Requests (`/yes`)', path: '/yes', selector: `a[href$="/yes/${request.id}"]` },
    {
      name: 'A request (`/yes/$approvalId`)',
      path: `/yes/${request.id}`,
      selector: 'button[data-approval="approve"]',
    },
  ] as const;
  await page.addInitScript(measuring(screens.map((screen) => screen.selector)));
  const cdp = await slowed(page);
  const ready: { path: string; ms: number }[] = [];
  const rows = [
    `| Screen | First paint | Largest paint | Ready | Scripts and styles sent |`,
    '|---|---:|---:|---:|---:|',
  ];
  for (const screen of screens) {
    const loads: Load[] = [];
    for (let run = 0; run < LOADS; run += 1) loads.push(await load(page, screen.path, screen.selector));
    rows.push(
      `| ${screen.name} | ${ms(median(loads.map((one) => one.firstPaint)))} | ${ms(median(loads.map((one) => one.largestPaint)))} | ${ms(median(loads.map((one) => one.ready)))} | ${median(loads.map((one) => one.sentKiB)).toFixed(1)} KiB |`,
    );
    for (const one of loads) expect(one.ready, `${screen.path} shows what it is for`).toBeGreaterThan(0);
    ready.push({ path: screen.path, ms: median(loads.map((one) => one.ready)) });
  }
  await cdp.detach();
  const table = `### First paint on slow 4G, CPU ×${String(CPU_SLOWDOWN)}, cold, median of ${String(LOADS)} (${test.info().project.name})\n\n${rows.join('\n')}\n`;
  await test.info().attach('first-paint.md', { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  // Asked once the table is out: a screen over budget still leaves its figures.
  for (const screen of ready) {
    expect(screen.ms, `${screen.path} ready on slow 4G, median`).toBeLessThanOrEqual(READY_BUDGET_MS);
  }
});
