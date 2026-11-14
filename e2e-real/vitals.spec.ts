// SPDX-License-Identifier: Apache-2.0
// The console's web vitals on a slow phone, against the real server: the largest contentful paint (LCP) of five
// screens loaded cold, and the delay before the next paint after a real interaction on each (INP), on DevTools' Fast 3G
// with the CPU of a mid-tier phone. Within Google's "good": LCP under 2.5 s, INP under 200 ms. Chromium only: the
// network and the CPU are slowed through the DevTools protocol.
import { appendFileSync } from 'node:fs';
import { type CDPSession, expect, type Locator, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { BOOTED } from '../src/shared/build/bootScript';
import { askingToken, askPushToMain, gatedRepository, loginOf, requestOf } from './gate';
import { ownerOfNewOrganization } from './real';

/** DevTools' Fast 3G: 562.5 ms a round trip, 1.44 Mbit/s down, 675 kbit/s up. */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1.6 * 1000 * 1000 * 0.9) / 8,
  uploadThroughput: (750 * 1000 * 0.9) / 8,
} as const;
/**
 * Lighthouse's BenchmarkIndex (core/lib/page-functions.js, `computeBenchmarkIndex`), as is: how many times a second the
 * browser builds a string of 10,000 characters and copies an array of 100,000 integers, divided by 10, averaged. About
 * 1,500 to 2,000 on a high-end desktop, 125 to 800 on a mid-tier phone (docs/throttling.md).
 */
function benchmarkIndex(): number {
  function withGarbage(): number {
    const start = Date.now();
    let iterations = 0;
    while (Date.now() - start < 500) {
      let built = '';
      for (let j = 0; j < 10_000; j += 1) built += 'a';
      if (built.length === 1) throw new Error('never: keeps the loop from being optimized away');
      iterations += 1;
    }
    return Math.round(iterations / 10 / ((Date.now() - start) / 1000));
  }
  function withoutGarbage(): number {
    const first: number[] = [];
    const second: number[] = [];
    for (let i = 0; i < 100_000; i += 1) first[i] = second[i] = i;
    const start = Date.now();
    let iterations = 0;
    while (iterations % 10 !== 0 || Date.now() - start < 500) {
      const from = iterations % 2 === 0 ? first : second;
      const to = iterations % 2 === 0 ? second : first;
      for (let j = 0; j < from.length; j += 1) to[j] = from[j] ?? 0;
      iterations += 1;
    }
    return Math.round(iterations / 10 / ((Date.now() - start) / 1000));
  }
  return (withGarbage() + withoutGarbage()) / 2;
}

/** The benchmark is run this many times, unthrottled, before the loads; the median is kept. */
const BENCHMARKS = 5;

/**
 * The CPU slowdown that brings this machine to Lighthouse's mobile device, from its BenchmarkIndex: the formula of
 * Lighthouse's CPU throttling calculator (lighthouse-cpu-throttling-calculator.vercel.app, linked from
 * docs/throttling.md), whose default ×4 is for a high-end desktop near 1,500. A fixed ×4 made the runner's own speed
 * part of the result: the same build measured 2,364 to 2,584 ms from one run to another. Below 150 the machine is too
 * slow to emulate that device, and the test says so rather than measure it.
 */
function cpuSlowdownFor(index: number): number {
  if (index >= 1_300) return 3 + (index - 1_300) / 233;
  if (index >= 800) return 2 + (index - 800) / 500;
  if (index >= 150) return 1 + (index - 150) / 650;
  throw new Error(
    `BenchmarkIndex ${String(index)}: this machine is too slow to emulate Lighthouse's mobile device`,
  );
}
/** Each screen is loaded this many times, cold; the median is kept. */
const LOADS = 3;
/** Google's "good" thresholds (web.dev/articles/vitals). */
const LCP_BUDGET_MS = 2_500;
const INP_BUDGET_MS = 200;

/** Where the page keeps what it measured (the script below). */
const MEASURED = '__ostromVitals';

/**
 * Measures in the page, from its first script on (Playwright's init script, as the CSP forbids evaluating a string):
 * the largest contentful paint, and the longest interaction, the slowest event of each `interactionId`, from the input
 * to the next paint. Events under 16 ms are not reported by the browser: an INP of 0 means "under 16 ms".
 */
const MEASURING = `(() => {
  let largestPaint = -1;
  let largestElement = '';
  let interaction = 0;
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1);
    if (last === undefined) return;
    largestPaint = last.startTime;
    const element = last.element;
    largestElement = element
      ? element.tagName.toLowerCase() + ' "' + (element.textContent ?? '').trim().slice(0, 40) + '"'
      : last.url;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.interactionId > 0 && entry.duration > interaction) interaction = entry.duration;
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  Object.defineProperty(globalThis, ${JSON.stringify(MEASURED)}, {
    get: () => ({ largestPaint, largestElement, interaction }),
  });
})();`;

const zMeasured = z.object({ largestPaint: z.number(), largestElement: z.string(), interaction: z.number() });

/** An API call the console made while a screen loaded: what it asked, in which organization, and when. */
interface ApiCall {
  readonly method: string;
  readonly path: string;
  readonly org: string;
  readonly csrf: boolean;
  readonly at: number;
}

const zResources = z.array(z.tuple([z.string(), z.number(), z.number(), z.number(), z.number()]));

/**
 * The files of the page's load until now, from its Resource Timing: when each was asked for, sent (after its wait for a
 * connection), done, and its size over the wire; where the time before the first paint goes, without a trace.
 */
async function filesOf(page: Page): Promise<string> {
  const entries = zResources.parse(
    await page.evaluate(`performance.getEntriesByType('resource').map((entry) => [
      entry.name.replace(location.origin, ''), entry.startTime, entry.requestStart, entry.responseEnd, entry.transferSize,
    ])`),
  );
  return entries
    .filter(([name]) => !name.startsWith('/api/'))
    .map(
      ([name, asked, sent, done, size]) =>
        `${name.replace(/^\/assets\//, '')} ${ms(asked)}/${ms(sent)}/${ms(done)} ${(size / 1000).toFixed(1)}`,
    )
    .join('; ');
}

/**
 * What is wrong with the API calls of one load: the same call made twice (same method, address and organization,
 * so a preload the console did not take up shows here), a call in another organization than this person's, a
 * change without its CSRF token.
 */
function callProblems(calls: readonly ApiCall[], org: string): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const call of calls) {
    const where = call.org === '' ? '' : ` [${call.org === org ? 'org' : call.org}]`;
    const key = `${call.method} ${call.path}${where}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (call.org !== '' && call.org !== org) problems.push(`${key}: in another organization`);
    if (call.method !== 'GET' && call.method !== 'HEAD' && !call.csrf) problems.push(`${key}: no CSRF token`);
  }
  for (const [key, count] of seen) if (count > 1) problems.push(`${key}: made ${String(count)} times`);
  return problems;
}

async function measuredOn(page: Page): Promise<z.infer<typeof zMeasured>> {
  return zMeasured.parse(await page.evaluate((key): unknown => Reflect.get(globalThis, key), MEASURED));
}

/** The page's network and CPU slowed down, and its cache off: every load is a first visit. */
async function slowed(page: Page, cpuSlowdown: number): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  return cdp;
}

/** Opens a screen from the navigation, as a person does: the bar on a wide screen, the menu on a phone. */
async function navigate(page: Page, isMobile: boolean, name: string): Promise<void> {
  if (isMobile) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name, exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { timeout: 30_000 });
}

/** The monthly field of the spend screen's budget form. */
function monthlyBudget(page: Page): Locator {
  return page.getByRole('region', { name: 'Set a budget' }).getByRole('textbox', { name: 'Per month ($)' });
}

interface Screen {
  readonly path: string;
  /** What the screen is for, on it: once visible, the largest paint is read. */
  readonly ready: (page: Page) => Locator;
  /** A real interaction a person makes there. */
  readonly interact: (page: Page, isMobile: boolean) => Promise<void>;
  readonly interaction: string;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function ms(value: number): string {
  if (Number.isNaN(value) || value < 0) return 'n/a';
  return value === 0 ? '< 16 ms' : `${String(Math.round(value))} ms`;
}

test('LCP and INP of five screens on Fast 3G, the CPU of a mid-tier phone', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium', 'the network and the CPU are slowed through the DevTools protocol');
  test.setTimeout(600_000);
  const { id: org } = await ownerOfNewOrganization(page, 'vita');
  // A request waiting for this person's yes: the queue lists it, a link to open.
  const repo = await gatedRepository(page, org, [await loginOf(page)]);
  const gate = await askPushToMain(await askingToken(page, org), org, repo);
  const request = await requestOf(page, org, gate);

  const screens: readonly Screen[] = [
    {
      path: '/',
      ready: (on) => on.getByRole('heading', { level: 1 }),
      interaction: 'opens Sessions from the navigation',
      interact: async (on, mobile) => navigate(on, mobile, 'Sessions'),
    },
    {
      path: '/yes',
      ready: (on) => on.locator(`a[href$="/yes/${request.id}"]`),
      interaction: 'opens the request',
      interact: async (on) => {
        await on.locator(`a[href$="/yes/${request.id}"]`).click();
        await expect(on.locator('button[data-approval="approve"]')).toBeVisible({ timeout: 30_000 });
      },
    },
    {
      path: '/rules',
      ready: (on) => on.getByRole('button', { name: 'New rule' }),
      interaction: 'opens a new rule',
      interact: async (on) => {
        await on.getByRole('button', { name: 'New rule' }).click();
        await expect(on.getByRole('textbox', { name: 'Rule' })).toBeVisible({ timeout: 30_000 });
      },
    },
    {
      path: '/spend',
      ready: monthlyBudget,
      interaction: 'types a monthly budget',
      interact: async (on) => {
        const field = monthlyBudget(on);
        await field.click();
        await on.keyboard.type('100');
        await expect(field).toHaveValue('100');
      },
    },
    {
      path: '/sessions',
      ready: (on) => on.getByRole('heading', { level: 1, name: 'Sessions' }),
      interaction: 'opens Rules from the navigation',
      interact: async (on, mobile) => navigate(on, mobile, 'Rules'),
    },
  ];

  await page.addInitScript(MEASURING);
  // Every CSP violation of the loads: the build drops what it takes for pure (vite.config.ts, `manualPureFunctions`),
  // and a zod without its configuration would probe eval. Init scripts are not subject to the page's CSP.
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript({
    content: `document.addEventListener('securitypolicyviolation', (event) => {
      console.error('Content Security Policy violation: ' + event.effectiveDirective + ' blocked ' + event.blockedURI
        + ' at ' + event.sourceFile + ':' + event.lineNumber);
    });`,
  });
  // The machine's speed, measured unthrottled on the console's own page, sets the slowdown.
  const indexes: number[] = [];
  for (let run = 0; run < BENCHMARKS; run += 1) indexes.push(await page.evaluate(benchmarkIndex));
  const index = median(indexes);
  const cpuSlowdown = cpuSlowdownFor(index);
  const cdp = await slowed(page, cpuSlowdown);
  // Every API call of the page, from the navigation on: what each load asked, and when.
  let calls: ApiCall[] = [];
  let navigatedAt = 0;
  page.on('request', (sent) => {
    const url = new URL(sent.url());
    if (!url.pathname.startsWith('/api/')) return;
    const headers = sent.headers();
    calls.push({
      method: sent.method(),
      path: `${url.pathname}${url.search}`,
      org: headers['ostrom-org'] ?? '',
      csrf: headers['x-csrf-token'] !== undefined,
      at: Date.now() - navigatedAt,
    });
  });
  const rows = [
    '| Screen | LCP (median) | INP (median) | Interaction | Largest paint | API calls before it is up |',
    '|---|---:|---:|---|---|---|',
  ];
  const results: { path: string; lcp: number; inp: number }[] = [];
  const problems: string[] = [];
  const timelines: string[] = [];
  const files: string[] = [];
  for (const screen of screens) {
    const lcps: number[] = [];
    const inps: number[] = [];
    let element = '';
    let firstCalls: readonly ApiCall[] = [];
    for (let run = 0; run < LOADS; run += 1) {
      calls = [];
      navigatedAt = Date.now();
      await page.goto(screen.path, { waitUntil: 'commit' });
      await expect(screen.ready(page)).toBeVisible({ timeout: 60_000 });
      // The largest paint is final once the screen is up and painted once more; an input stops it from growing.
      await page.waitForTimeout(500);
      const measured = await measuredOn(page);
      lcps.push(measured.largestPaint);
      element = measured.largestElement;
      const loaded = [...calls];
      // A read /boot.js started and the console never took up was made for nothing.
      const untaken = z.array(z.string()).parse(
        await page.evaluate((key): unknown => {
          const store: unknown = Reflect.get(globalThis, key);
          return typeof store === 'object' && store !== null ? Object.keys(store) : [];
        }, BOOTED),
      );
      problems.push(
        ...untaken.map(
          (key) => `${screen.path}, load ${String(run + 1)}: ${key} started by /boot.js, never taken up`,
        ),
      );
      if (run === 0) {
        firstCalls = loaded;
        files.push(`- \`${screen.path}\` (LCP ${ms(measured.largestPaint)}): ${await filesOf(page)}`);
      }
      problems.push(
        ...callProblems(loaded, org).map((problem) => `${screen.path}, load ${String(run + 1)}: ${problem}`),
      );
      await screen.interact(page, isMobile);
      await page.waitForTimeout(500);
      inps.push((await measuredOn(page)).interaction);
    }
    const lcp = median(lcps);
    const inp = median(inps);
    results.push({ path: screen.path, lcp, inp });
    const asked = firstCalls.map((call) => `${call.method} ${call.path}${call.org === '' ? '' : ' [org]'}`);
    rows.push(
      `| \`${screen.path}\` | ${ms(lcp)} | ${ms(inp)} | ${screen.interaction} | ${element} | ${String(asked.length)} |`,
    );
    timelines.push(
      `- \`${screen.path}\`: ${firstCalls.map((call, index) => `${String(call.at)} ms ${asked[index] ?? ''}`).join('; ')}`,
    );
  }
  await cdp.detach();
  const table = `### Web vitals on Fast 3G, CPU ×${cpuSlowdown.toFixed(2)} (BenchmarkIndex ${String(index)}, runs ${indexes.join(', ')}), cold, median of ${String(LOADS)} (${test.info().project.name})\n\nBudgets: LCP ≤ ${String(LCP_BUDGET_MS)} ms, INP ≤ ${String(INP_BUDGET_MS)} ms.\n\n${rows.join('\n')}\n\nAPI calls of the first load, from the navigation:\n\n${timelines.join('\n')}\n\nFiles of the first load (asked, sent, done in ms; KB over the wire):\n\n${files.join('\n')}\n`;
  await test.info().attach('vitals.md', { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  console.warn(table);
  // Asked once the table is out: a screen over budget still leaves every figure.
  // Each call once, in this person's organization, a change with its CSRF token: a preload never doubles a call.
  expect.soft(problems, 'the API calls of each load').toEqual([]);
  expect.soft(violations, 'the CSP violations of the loads').toEqual([]);
  for (const { path, lcp, inp } of results) {
    expect.soft(lcp, `${path}: LCP, median`).toBeGreaterThan(0);
    expect.soft(lcp, `${path}: LCP, median`).toBeLessThanOrEqual(LCP_BUDGET_MS);
    expect.soft(inp, `${path}: INP, median`).toBeLessThanOrEqual(INP_BUDGET_MS);
  }
});
