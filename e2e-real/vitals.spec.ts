// SPDX-License-Identifier: AGPL-3.0-only
// The console's web vitals on a slow phone, against the real server: the largest contentful paint (LCP) of five
// screens loaded cold, and the delay before the next paint after a real interaction on each (INP), on DevTools' Fast 3G
// with a CPU four times slower. Within Google's "good": LCP under 2.5 s, INP under 200 ms. Chromium only: the network
// and the CPU are slowed through the DevTools protocol.
import { appendFileSync } from 'node:fs';
import { type CDPSession, expect, type Locator, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { askingToken, askPushToMain, gatedRepository, loginOf, requestOf } from './gate';
import { ownerOfNewOrganization } from './real';

/** DevTools' Fast 3G: 562.5 ms a round trip, 1.44 Mbit/s down, 675 kbit/s up. */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1.6 * 1000 * 1000 * 0.9) / 8,
  uploadThroughput: (750 * 1000 * 0.9) / 8,
} as const;
const CPU_SLOWDOWN = 4;
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
  let interaction = 0;
  new PerformanceObserver((list) => {
    largestPaint = list.getEntries().at(-1)?.startTime ?? largestPaint;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.interactionId > 0 && entry.duration > interaction) interaction = entry.duration;
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  Object.defineProperty(globalThis, ${JSON.stringify(MEASURED)}, { get: () => ({ largestPaint, interaction }) });
})();`;

const zMeasured = z.object({ largestPaint: z.number(), interaction: z.number() });

async function measuredOn(page: Page): Promise<z.infer<typeof zMeasured>> {
  return zMeasured.parse(await page.evaluate((key): unknown => Reflect.get(globalThis, key), MEASURED));
}

/** The page's network and CPU slowed down, and its cache off: every load is a first visit. */
async function slowed(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
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

test('LCP and INP of five screens on Fast 3G, CPU ×4', async ({ page, browserName, isMobile }) => {
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
  const cdp = await slowed(page);
  const rows = ['| Screen | LCP (median) | INP (median) | Interaction |', '|---|---:|---:|---|'];
  const results: { path: string; lcp: number; inp: number }[] = [];
  for (const screen of screens) {
    const lcps: number[] = [];
    const inps: number[] = [];
    for (let run = 0; run < LOADS; run += 1) {
      await page.goto(screen.path, { waitUntil: 'commit' });
      await expect(screen.ready(page)).toBeVisible({ timeout: 60_000 });
      // The largest paint is final once the screen is up and painted once more; an input stops it from growing.
      await page.waitForTimeout(500);
      lcps.push((await measuredOn(page)).largestPaint);
      await screen.interact(page, isMobile);
      await page.waitForTimeout(500);
      inps.push((await measuredOn(page)).interaction);
    }
    const lcp = median(lcps);
    const inp = median(inps);
    results.push({ path: screen.path, lcp, inp });
    rows.push(`| \`${screen.path}\` | ${ms(lcp)} | ${ms(inp)} | ${screen.interaction} |`);
  }
  await cdp.detach();
  const table = `### Web vitals on Fast 3G, CPU ×${String(CPU_SLOWDOWN)}, cold, median of ${String(LOADS)} (${test.info().project.name})\n\nBudgets: LCP ≤ ${String(LCP_BUDGET_MS)} ms, INP ≤ ${String(INP_BUDGET_MS)} ms.\n\n${rows.join('\n')}\n`;
  await test.info().attach('vitals.md', { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  console.warn(table);
  // Asked once the table is out: a screen over budget still leaves every figure.
  for (const { path, lcp, inp } of results) {
    expect.soft(lcp, `${path}: LCP, median`).toBeGreaterThan(0);
    expect.soft(lcp, `${path}: LCP, median`).toBeLessThanOrEqual(LCP_BUDGET_MS);
    expect.soft(inp, `${path}: INP, median`).toBeLessThanOrEqual(INP_BUDGET_MS);
  }
});
