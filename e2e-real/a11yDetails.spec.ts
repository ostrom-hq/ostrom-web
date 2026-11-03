// SPDX-License-Identifier: AGPL-3.0-only
// The screens the navigation does not list, reached from a line of a list or a link (a request, a session, a workflow,
// a receipt, a group, the account, a device's sign-in), each with a real item of a new organization behind it,
// checked by axe against WCAG 2.2 A and AA, in the light and the dark theme, on a wide screen and a phone. Their
// table is attached to the run as the navigation's is (a11yScreens.spec.ts); every screen must have nothing.
//
// Left out: `/confirm/$confirmationId`, which only a CLI's pending confirmation opens (confirm.spec.ts drives one),
// and the sign-in by e-mail link (`/auth/email`), which leaves for another screen as it opens.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { zCreateTokenResponse, zGroup, zListDecisionsResponse, zRule } from '../gen/api/zod.gen';
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

/** One of each item the detail screens show, made through the API as the journeys do: the paths to check. */
async function detailScreens(page: Page, org: { id: string; slug: string }): Promise<string[]> {
  const run = uniqueRun();

  // A request waiting for the owner's yes.
  const repo = await gatedRepository(page, org.id, [await loginOf(page)]);
  const request = await requestOf(
    page,
    org.id,
    await askPushToMain(await askingToken(page, org.id), org.id, repo),
  );

  // A workflow of the organization, accepted.
  const workflow = `axe-${run}`;
  await acceptedWorkflow(page, org.id, {
    id: workflow,
    name: `Review before merge ${run}`,
    nodes: [
      {
        id: 'release',
        kind: 'gate',
        label: 'Release',
        approvers: [await loginOf(page)],
        actions: [{ class: 'push-main', label: 'Push to the main branch', patterns: [], repos: [repo] }],
      },
    ],
    edges: [],
  });

  // A session an agent opened, live.
  const token = await callFromPage(
    page,
    'POST',
    '/api/v1/tokens',
    { name: 'axe CLI', scopes: ['sessions:write'], expiresInDays: 1 },
    org.id,
  );
  expect(token.status, JSON.stringify(token.body)).toBe(201);
  const session = randomUUID();
  const started = await withToken(
    zCreateTokenResponse.pick({ secret: true }).parse(token.body).secret,
    org.id,
    'POST',
    '/api/v1/sessions',
    { id: session, agent: 'claude', repo: `${org.slug}/api`, model: 'claude-sonnet' },
  );
  expect(started.status, JSON.stringify(started.body)).toBeLessThan(300);

  // A rule written: its decision is signed, and the receipt has a screen.
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
    .poll(async () => {
      const read = await callFromPage(page, 'GET', '/api/v1/decisions', undefined, org.id);
      receipt =
        read.status === 200
          ? zListDecisionsResponse
              .parse(read.body)
              .items.find((decision) => decision.subject.kind === 'rule' && decision.subject.id === ruleId)
              ?.receiptId
          : undefined;
      return receipt;
    })
    .toBeDefined();

  // A group of the shared accounts.
  const group = await callFromPage(page, 'POST', '/api/v1/groups', { name: 'Platform' }, org.id);
  expect(group.status, JSON.stringify(group.body)).toBeLessThan(300);
  const groupId = zGroup.pick({ id: true }).parse(group.body).id;

  return [
    `/yes/${request.id}`,
    `/sessions/${session}`,
    '/workflows/new',
    `/workflows/${workflow}`,
    `/receipts/${z.string().parse(receipt)}`,
    `/accounts/groups/${groupId}`,
    '/account',
    '/device',
  ];
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every detail screen, ${scheme}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const org = await ownerOfNewOrganization(page, `axd${scheme}`);
    const screens = await detailScreens(page, org);
    const found = new Map<string, string[]>();
    for (const path of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // What the screen reads comes in after its title: a moment for it, then axe.
      await page.waitForTimeout(1_000);
      found.set(path, await violationsOn(page));
    }
    await expectNoViolations('details', scheme, found);
  });
}
