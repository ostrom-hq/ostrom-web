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

/** Who the person is and the organizations they have, asked together, then what the organization holds. */
const MAX_DEPTH = 2;
const MAX_CALLS = 10;
/** A screen that asks the server still after this long never settles: a loop, not a load. */
const SETTLE_LIMIT_MS = 30_000;
/**
 * The questions a screen asks again on purpose once answered. The queue of approvals asks every 2 s, for the other
 * approvers' answers; the organization joins the question once it is known (shared/api/apiClient.ts).
 */
const POLLS: Readonly<Partial<Record<(typeof screens)[number], readonly string[]>>> = {
  '/yes': ['GET /api/v1/approvals?mine=true'],
  // Not a poll: the policy reads its members' names by `GET /api/v1/members`, still `planned` in the contract, which
  // the server answers 404; a 404 in the organization reads the person's list again (shared/api/apiClient.ts). Remove this line
  // when the server serves the route (JOURNAL, SRV-ORG).
  '/policy': ['GET /api/v1/me/organizations'],
};

interface Call {
  readonly name: string;
  /** The question without the organization it names: a poll asks it again once the organization is known. */
  readonly asked: string;
  readonly start: number;
  /** When its answer had arrived; never, for a stream still open. */
  readonly end: number;
}

/** The calls to the API a full load of `path` makes, until none has started for a second and a half. */
async function callsOnLoad(
  page: Page,
  path: string,
): Promise<{ readonly calls: Call[]; readonly settled: boolean }> {
  const started = new Map<Request, number>();
  let settled = false;
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
    const limit = performance.now() + SETTLE_LIMIT_MS;
    let seen = -1;
    while (seen !== started.size && performance.now() < limit) {
      seen = started.size;
      await page.waitForTimeout(1500);
    }
    settled = seen === started.size;
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onEnd);
    page.off('requestfailed', onEnd);
  }
  const calls = [...started].map(([request, start]) => {
    const url = new URL(request.url());
    // The same path in an organization or out of one is not the same question (`GET /auth/me`, ostrom-server#92).
    const inOrg = request.headers()['ostrom-org'] === undefined ? '' : ' (in the org)';
    return {
      name: `${request.method()} ${url.pathname}${url.search}${inOrg}`,
      asked: `${request.method()} ${url.pathname}${url.search}`,
      start,
      end: ended.get(request) ?? Number.POSITIVE_INFINITY,
    };
  });
  return { calls, settled };
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

/**
 * The calls asked again once their first answer was in. The console adds the organization to a call once it knows it,
 * so the same question may come back with it; on `/auth/…` the caller names it, and the call in the organization is
 * another question (ostrom-server#92).
 */
function againIn(calls: readonly Call[]): Call[] {
  const same = (a: Call, b: Call): boolean =>
    a.asked.includes(' /api/v1/auth/') ? a.name === b.name : a.asked === b.asked;
  return calls.filter((call) => calls.some((other) => same(other, call) && other.end <= call.start));
}

/** The calls asked again while the first one was still on its way: the same question, asked twice. */
function twiceIn(calls: readonly Call[]): string[] {
  const twice = calls.filter((call) =>
    calls.some(
      (other) =>
        other !== call && other.name === call.name && other.start <= call.start && other.end > call.start,
    ),
  );
  return [...new Set(twice.map((call) => call.name))];
}

test('what each screen asks the server when it loads', async ({ page }) => {
  test.setTimeout(180_000);
  await ownerOfNewOrganization(page, 'ada');

  const rows = [
    '| Screen | Calls | Depth | Asked twice | Polled | Calls in order |',
    '|---|---:|---:|---|---|---|',
  ];
  const problems: string[] = [];
  for (const screen of screens) {
    const { calls: all, settled } = await callsOnLoad(page, screen);
    // Only a poll the screen means is left out; any other question asked again counts, and is reported.
    const polls = againIn(all).filter((call) => POLLS[screen]?.includes(call.asked) === true);
    const calls = all.filter((call) => !polls.includes(call));
    const again = [...new Set(againIn(calls).map((call) => call.name))];
    const ordered = calls.toSorted((a, b) => a.start - b.start).map((call) => `\`${call.name}\``);
    const depth = depthOf(calls);
    const twice = twiceIn(calls);
    if (!settled) problems.push(`${screen}: still asking after ${String(SETTLE_LIMIT_MS / 1000)} s`);
    if (twice.length > 0) problems.push(`${screen}: asked twice ${twice.join(', ')}`);
    if (again.length > 0) problems.push(`${screen}: asked again once answered ${again.join(', ')}`);
    if (depth > MAX_DEPTH) problems.push(`${screen}: a chain of ${String(depth)} calls`);
    if (calls.length > MAX_CALLS) problems.push(`${screen}: ${String(calls.length)} calls`);
    const polled = [...new Set(polls.map((call) => call.asked))].map((asked) => `\`${asked}\``);
    rows.push(
      `| \`${screen}\` | ${String(calls.length)} | ${String(depth)} | ${[...twice, ...again].join(', ')} | ${String(polls.length)} ${polled.join(' ')} | ${ordered.join(' ')} |`,
    );
  }
  const table = `### API calls on load (${test.info().project.name})\n\n${rows.join('\n')}\n`;
  await test.info().attach('api-calls-on-load.md', { body: table, contentType: 'text/markdown' });
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, table);
  // Each screen asks its data at once: no question asked twice, no chain longer than who the person is and their
  // organizations, then what the organization holds (2), and a load that stays small and ends.
  expect(problems, table).toEqual([]);
});
