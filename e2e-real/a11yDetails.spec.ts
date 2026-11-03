// SPDX-License-Identifier: AGPL-3.0-only
// The screens the navigation does not list, reached from a line of a list or a link (a request, a session with its
// gate, a workflow, a receipt, a group, the account, a CLI's sign-in waiting for a yes), each with a real item of a new
// organization behind it, and its content in (no loading left, its item's own text shown) before axe runs,
// checked by axe against WCAG 2.2 A and AA, in the light and the dark theme, on a wide screen and a phone. Their
// table is attached to the run as the navigation's is (a11yScreens.spec.ts); every screen must have nothing.
//
// Left out: `/confirm/$confirmationId`, which only a CLI's pending confirmation opens (confirm.spec.ts drives one),
// and the sign-in by e-mail link (`/auth/email`), which leaves for another screen as it opens.
import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, request, test } from '@playwright/test';
import { z } from 'zod';
import { zCreateTokenResponse, zDeviceCode, zGroup, zListDecisionsResponse, zRule } from '../gen/api/zod.gen';
import { expectNoViolations, violationsOn } from './axe';
import {
  acceptedWorkflow,
  askingToken,
  askPushToMain,
  gatedRepository,
  loginOf,
  requestOf,
  uniqueRun,
  withToken,
} from './gate';
import { callFromPage, ownerOfNewOrganization } from './real';

/** A screen to check: its path, and what shows once its own item is in (beyond its title). */
interface DetailScreen {
  readonly path: string;
  readonly ready?: (page: Page) => Locator;
}

/** A CLI's sign-in, started as `ostrom login` does, without a session: the code the person confirms on `/device`. */
async function startedLogin(): Promise<string> {
  const { baseURL } = test.info().project.use;
  const cli = await request.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    const started = await cli.post('/api/v1/auth/device', { data: {} });
    expect(started.status()).toBe(200);
    return zDeviceCode.parse(await started.json()).userCode;
  } finally {
    await cli.dispose();
  }
}

/** One of each item the detail screens show, made through the API as the journeys do: the screens to check. */
async function detailScreens(page: Page, org: { id: string; slug: string }): Promise<DetailScreen[]> {
  const run = uniqueRun();
  const login = await loginOf(page);

  // A session an agent opened, live, with the request below asked in it: its gate shows on the session's screen.
  const token = await callFromPage(
    page,
    'POST',
    '/api/v1/tokens',
    { name: 'axe CLI', scopes: ['sessions:write'], expiresInDays: 1 },
    org.id,
  );
  expect(token.status, JSON.stringify(token.body)).toBe(201);
  const session = randomUUID();
  const sessionRepo = `${org.slug}/api`;
  const started = await withToken(
    zCreateTokenResponse.pick({ secret: true }).parse(token.body).secret,
    org.id,
    'POST',
    '/api/v1/sessions',
    { id: session, agent: 'claude', repo: sessionRepo, model: 'claude-sonnet' },
  );
  expect(started.status, JSON.stringify(started.body)).toBeLessThan(300);

  // A request waiting for the owner's yes, asked in that session.
  const repo = await gatedRepository(page, org.id, [login]);
  const asked = await requestOf(
    page,
    org.id,
    await askPushToMain(await askingToken(page, org.id), org.id, repo, session),
  );

  // A workflow of the organization, accepted, on a repository of its own: no second gate on the request's pushes.
  const workflow = `axe-${run}`;
  const workflowName = `Review before merge ${run}`;
  await acceptedWorkflow(page, org.id, {
    id: workflow,
    name: workflowName,
    nodes: [
      {
        id: 'release',
        kind: 'gate',
        label: 'Release',
        approvers: [login],
        actions: [
          { class: 'push-main', label: 'Push to the main branch', patterns: [], repos: [`acme/web-${run}`] },
        ],
      },
    ],
    edges: [],
  });

  // A rule written: its decision is signed once the change commits, and the receipt has a screen.
  const rule = await callFromPage(
    page,
    'POST',
    '/api/v1/rules',
    { statement: `Run the migrations in a transaction (${run}).`, group: 'Data' },
    org.id,
  );
  expect(rule.status, JSON.stringify(rule.body)).toBe(201);
  const ruleId = zRule.pick({ id: true }).parse(rule.body).id;
  let receipt: string | undefined;
  await expect
    .poll(
      async () => {
        const read = await callFromPage(
          page,
          'GET',
          `/api/v1/decisions?subjectKind=rule&subjectId=${encodeURIComponent(ruleId)}`,
          undefined,
          org.id,
        );
        receipt =
          read.status === 200
            ? zListDecisionsResponse
                .parse(read.body)
                .items.find((decision) => decision.subject.kind === 'rule' && decision.subject.id === ruleId)
                ?.receiptId
            : undefined;
        return receipt;
      },
      { timeout: 30_000 },
    )
    .toBeDefined();

  // A group of the shared accounts.
  const group = await callFromPage(page, 'POST', '/api/v1/groups', { name: 'Platform' }, org.id);
  expect(group.status, JSON.stringify(group.body)).toBeLessThan(300);
  const groupId = zGroup.pick({ id: true }).parse(group.body).id;

  // A CLI's sign-in waiting for the person's yes: the screen with the code, the organization and the two answers.
  const userCode = await startedLogin();

  return [
    { path: `/yes/${asked.id}`, ready: (screen) => screen.locator('button[data-approval="approve"]') },
    { path: `/sessions/${session}`, ready: (screen) => screen.getByText(sessionRepo).first() },
    { path: '/workflows/new' },
    { path: `/workflows/${workflow}`, ready: (screen) => screen.getByText(workflowName).first() },
    { path: `/receipts/${z.string().parse(receipt)}` },
    {
      path: `/accounts/groups/${groupId}`,
      ready: (screen) => screen.getByRole('heading', { name: 'Platform' }),
    },
    { path: '/account' },
    { path: '/device' },
    {
      path: `/device?code=${encodeURIComponent(userCode)}`,
      ready: (screen) => screen.getByText(userCode).first(),
    },
  ];
}

/** Opens the screen and waits for its content: its title, no loading left, and its item's own text. */
async function opened(page: Page, screen: DetailScreen): Promise<void> {
  await page.goto(screen.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.o-skeleton, [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  if (screen.ready !== undefined) await expect(screen.ready(page)).toBeVisible({ timeout: 15_000 });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every detail screen, ${scheme}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const org = await ownerOfNewOrganization(page, `axd${scheme}`);
    const screens = await detailScreens(page, org);
    const found = new Map<string, string[]>();
    for (const screen of screens) {
      // A screen that does not open is a line of the table, as a violation is: the others are still checked.
      try {
        await opened(page, screen);
        found.set(screen.path, await violationsOn(page));
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        found.set(screen.path, [`did not open: ${reason.split('\n')[0] ?? ''}`]);
      }
    }
    await expectNoViolations('details', scheme, found);
  });
}
