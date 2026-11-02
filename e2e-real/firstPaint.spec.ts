// SPDX-License-Identifier: AGPL-3.0-only
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

/**
 * What the page measured, read in the page: the console's tests are typed for Node, so the code that runs there is a
 * string and its answer is parsed. A paint not reported yet is -1.
 */
const zPaints = z.object({ firstPaint: z.number(), largestPaint: z.number(), sent: z.number() });
const PAINTS = `new Promise((resolve) => {
  const firstPaint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
  const sent = performance
    .getEntriesByType('resource')
    .filter((entry) => /\\.(?:js|css)$/.test(new URL(entry.name).pathname))
    .reduce((total, entry) => total + entry.transferSize, 0);
  let largestPaint = -1;
  new PerformanceObserver((list) => {
    largestPaint = list.getEntries().at(-1)?.startTime ?? largestPaint;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  // The buffered entries come in a task of their own.
  setTimeout(() => resolve({ firstPaint, largestPaint, sent }), 0);
})`;

/** Loads `path` cold and reads its paints once `selector` is on the page. */
async function load(page: Page, path: string, selector: string): Promise<Load> {
  await page.goto(path, { waitUntil: 'commit' });
  // Checked at each frame in the page: the time is the frame's, not a round trip to the test's.
  const ready = await page.waitForFunction(
    `document.querySelector(${JSON.stringify(selector)}) === null ? false : performance.now()`,
    undefined,
    { polling: 'raf', timeout: 60_000 },
  );
  const readyAt = z.number().parse(await ready.jsonValue());
  const paints = zPaints.parse(await page.evaluate(PAINTS));
  return {
    firstPaint: paints.firstPaint,
    largestPaint: paints.largestPaint,
    ready: readyAt,
    sentKiB: paints.sent / 1024,
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
  const cdp = await slowed(page);
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
  }
  await cdp.detach();
  const table = `### First paint on slow 4G, CPU ×${String(CPU_SLOWDOWN)}, cold, median of ${String(LOADS)} (${test.info().project.name})\n\n${rows.join('\n')}\n`;
  await test.info().attach('first-paint.md', { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
});
