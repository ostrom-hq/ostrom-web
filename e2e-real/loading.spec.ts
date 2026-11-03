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
 * The questions a screen asks again on purpose once answered, and how often (useYes.ts): the queue of approvals every
 * 2 s, for the other approvers' answers, and the decided requests every 10 s. A repeat sooner than three quarters of
 * its period after the last answer is no poll, and counts. The organization joins a question once it is known
 * (shared/api/apiClient.ts), so a poll is matched without it.
 */
const POLLS: Readonly<Partial<Record<(typeof screens)[number], Readonly<Record<string, number>>>>> = {
  '/yes': {
    'GET /api/v1/approvals?mine=true': 2_000,
    'GET /api/v1/approvals?status=approved': 10_000,
    'GET /api/v1/approvals?status=rejected': 10_000,
    'GET /api/v1/approvals?status=expired': 10_000,
  },
};
/**
 * Questions read a second time for a cause outside the console, with it; shown apart, once a load at most (any more
 * count), and removed with their cause. The policy reads its members' names by `GET /api/v1/members`, still `planned`
 * in the contract, which the server answers 404; a 404 in the organization reads the person's list again
 * (shared/api/apiClient.ts). To be served by the server: SRV-ORG.
 */
const KNOWN: Readonly<Partial<Record<(typeof screens)[number], readonly string[]>>> = {
  '/policy': ['GET /api/v1/me/organizations'],
};

interface Call {
  readonly name: string;
  /** The question without the organization it names: a poll asks it again once the organization is known. */
  readonly asked: string;
  readonly start: number;
  /** When its answer had arrived, or it was cancelled; never, for a stream still open. */
  readonly end: number;
  /** Cancelled by the page before its answer: it still reached the server, so it counts. */
  readonly aborted: boolean;
}

/**
 * The calls to the API a full load of `path` makes, until none has started for a second and a half (or 30 s, a load
 * that never settles). The page is left first: a poll of the screen before is not this screen's call.
 */
async function callsOnLoad(
  page: Page,
  path: string,
): Promise<{ readonly calls: Call[]; readonly settled: boolean }> {
  await page.goto('about:blank');
  const started = new Map<Request, number>();
  const ended = new Map<Request, number>();
  const aborted = new Set<Request>();
  let settled = false;
  const onRequest = (request: Request): void => {
    if (new URL(request.url()).pathname.startsWith('/api/')) started.set(request, performance.now());
  };
  const onEnd = (request: Request): void => {
    if (started.has(request)) ended.set(request, performance.now());
  };
  const onFail = (request: Request): void => {
    // Chromium's word for a request the page cancelled (the projects run Chromium).
    if (request.failure()?.errorText.includes('ERR_ABORTED') === true) aborted.add(request);
    onEnd(request);
  };
  page.on('request', onRequest);
  page.on('requestfinished', onEnd);
  page.on('requestfailed', onFail);
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
    page.off('requestfailed', onFail);
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
      aborted: aborted.has(request),
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

/** The same question: on `/auth/…` the caller names the organization, and the call in it is another (server#92). */
function sameQuestion(a: Call, b: Call): boolean {
  return a.asked.includes(' /api/v1/auth/') ? a.name === b.name : a.asked === b.asked;
}

/** The calls asked again once an earlier answer to the same question was in. */
function againIn(calls: readonly Call[]): Call[] {
  return calls.filter((call) =>
    calls.some((other) => other !== call && sameQuestion(other, call) && other.end <= call.start),
  );
}

/** How long after the last answer to the same question `call` was asked. */
function gapOf(call: Call, calls: readonly Call[]): number {
  const before = calls.filter(
    (other) => other !== call && sameQuestion(other, call) && other.end <= call.start,
  );
  return call.start - Math.max(...before.map((other) => other.end));
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

/** The names of `calls`, once each, as code. */
function listed(calls: readonly Call[], key: 'name' | 'asked'): string {
  return [...new Set(calls.map((call) => call[key]))].map((name) => `\`${name}\``).join(' ');
}

/** One screen's row of the table, and what is wrong with its load. */
async function measure(
  page: Page,
  screen: (typeof screens)[number],
): Promise<{ row: string; problems: string[] }> {
  const { calls: all, settled } = await callsOnLoad(page, screen);
  const asked = againIn(all);
  // A poll the screen means, at its pace; a known second read, once. Anything else asked again counts.
  const polls = asked.filter((call) => {
    const every = POLLS[screen]?.[call.asked];
    return every !== undefined && gapOf(call, all) >= every * 0.75;
  });
  const known = asked
    .filter((call) => !polls.includes(call) && KNOWN[screen]?.includes(call.asked) === true)
    .slice(0, 1);
  const calls = all.filter((call) => !polls.includes(call) && !known.includes(call));
  const again = againIn(calls);
  const aborted = calls.filter((call) => call.aborted);
  const depth = depthOf(calls);
  const twice = twiceIn(calls);
  const problems: string[] = [];
  if (!settled) problems.push(`${screen}: still asking after ${String(SETTLE_LIMIT_MS / 1000)} s`);
  if (twice.length > 0) problems.push(`${screen}: asked twice ${twice.join(', ')}`);
  if (again.length > 0) problems.push(`${screen}: asked again once answered ${listed(again, 'name')}`);
  if (depth > MAX_DEPTH) problems.push(`${screen}: a chain of ${String(depth)} calls`);
  if (calls.length > MAX_CALLS) problems.push(`${screen}: ${String(calls.length)} calls`);
  const counted = (some: readonly Call[], key: 'name' | 'asked'): string =>
    some.length === 0 ? '' : `${String(some.length)} ${listed(some, key)}`;
  const cells = [
    `\`${screen}\``,
    String(calls.length),
    String(depth),
    twice.join(', '),
    listed(again, 'name'),
    counted(aborted, 'name'),
    counted(polls, 'asked'),
    counted(known, 'asked'),
    calls
      .toSorted((a, b) => a.start - b.start)
      .map((call) => `\`${call.name}\``)
      .join(' '),
  ];
  return { row: `| ${cells.join(' | ')} |`, problems };
}

test('what each screen asks the server when it loads', async ({ page }) => {
  // 23 screens, each up to its 30 s limit, and the sign-in.
  test.setTimeout(1_000_000);
  await ownerOfNewOrganization(page, 'ada');

  const rows = [
    '| Screen | Calls | Depth | Asked twice | Asked again | Cancelled | Polled | Known | Calls in order |',
    '|---|---:|---:|---|---|---|---|---|---|',
  ];
  const problems: string[] = [];
  try {
    for (const screen of screens) {
      const measured = await measure(page, screen);
      rows.push(measured.row);
      problems.push(...measured.problems);
    }
  } finally {
    // Written whatever happened: the screens measured before a failure are in it.
    const table = `### API calls on load (${test.info().project.name})\n\n${rows.join('\n')}\n`;
    await test.info().attach('api-calls-on-load.md', { body: table, contentType: 'text/markdown' });
    const summary = process.env['GITHUB_STEP_SUMMARY'];
    if (summary !== undefined) appendFileSync(summary, table);
  }
  // Each screen asks its data at once: no question asked twice, no chain longer than who the person is and their
  // organizations, then what the organization holds (2), and a load that stays small and ends.
  expect(problems, rows.join('\n')).toEqual([]);
});
