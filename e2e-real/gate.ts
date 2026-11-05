// SPDX-License-Identifier: AGPL-3.0-only
// A gate waiting for a yes, opened through the API as the QA bench does it (ostrom-e2e `scripts/load-setup.ts`): an
// accepted workflow whose gate node names the approvers of pushes to main of a repository, and a personal token with
// `gates:ask` that asks for such a push. Shared by the journeys that read or answer it.
import { expect, type Page, request, test } from '@playwright/test';
import { zAskGateResponse, zCreateTokenResponse, zListApprovalsResponse, zMe } from '../gen/api/zod.gen';
import { bodyOf, callFromPage, joinAs, ownerOfNewOrganization } from './real';
import { pick } from 'zod/mini';

/** The GitHub login the server knows the person signed in on `page` by: what a gate node names. */
export async function loginOf(page: Page): Promise<string> {
  const me = await callFromPage(page, 'GET', '/api/v1/auth/me');
  expect(me.status).toBe(200);
  return zMe.parse(me.body).dev.login;
}

/** A name no other journey uses. */
export function uniqueRun(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** An accepted workflow of `org`, written by its owner on `owner`, as the console's workflow screen saves one. */
export async function acceptedWorkflow(
  owner: Page,
  org: string,
  workflow: { readonly id: string; readonly name: string; readonly nodes: unknown; readonly edges: unknown },
): Promise<void> {
  const saved = await callFromPage(
    owner,
    'POST',
    '/api/v1/workflows',
    { ...workflow, domain: 'delivery', status: 'accepted', foundAt: new Date().toISOString() },
    org,
  );
  expect(saved.status, JSON.stringify(saved.body)).toBeLessThan(300);
}

/** A new repository of `org` whose pushes to main need a yes from `approvers` (workflow made by its owner). */
export async function gatedRepository(
  owner: Page,
  org: string,
  approvers: readonly string[],
): Promise<string> {
  const run = uniqueRun();
  const repo = `acme/api-${run}`;
  await acceptedWorkflow(owner, org, {
    id: `push-main-${run}`,
    name: `Push to main ${run}`,
    nodes: [
      {
        id: 'push-main',
        kind: 'gate',
        label: 'Push to main',
        approvers,
        actions: [{ class: 'push-main', label: 'Push to the main branch', patterns: [], repos: [repo] }],
      },
    ],
    edges: [],
  });
  return repo;
}

/** A personal token of the person on `page` that asks gates and reads them, never answers: a CI job's. */
export async function askingToken(page: Page, org: string): Promise<string> {
  const token = await callFromPage(
    page,
    'POST',
    '/api/v1/tokens',
    { name: 'journey asker', scopes: ['gates:ask', 'gates:read'], expiresInDays: 1 },
    org,
  );
  expect(token.status, JSON.stringify(token.body)).toBe(201);
  return pick(zCreateTokenResponse, { secret: true }).parse(token.body).secret;
}

/**
 * Calls the API with a bearer token alone, through the console's own origin (the preview proxies /api to the server):
 * a context of its own, without the browser's session cookie, so the token is the only credential.
 */
export async function withToken(
  token: string,
  org: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const { baseURL } = test.info().project.use;
  const context = await request.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    const response = await context.fetch(path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'Ostrom-Org': org, accept: 'application/json' },
      ...(body === undefined ? {} : { data: body }),
      failOnStatusCode: false,
    });
    return {
      status: response.status(),
      body: bodyOf(`${method} ${path}`, response.status(), await response.text()),
    };
  } finally {
    await context.dispose();
  }
}

/**
 * Asks for a push of a new commit to main of `repo`, as the hook would, in `sessionId` when given: the gate, still waiting
 * for a yes.
 */
export async function askPushToMain(
  token: string,
  org: string,
  repo: string,
  sessionId?: string,
): Promise<string> {
  const sha = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const asked = await withToken(token, org, 'POST', '/api/v1/gates', {
    ...(sessionId === undefined ? {} : { sessionId }),
    repo,
    class: 'git.push',
    tool: 'Bash',
    command: 'git push origin main',
    push: { remote: 'origin', refs: [{ ref: 'refs/heads/main', sha }] },
  });
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  const { gate } = zAskGateResponse.parse(asked.body);
  expect(gate.status).toBe('pending');
  return gate.id;
}

/** The request of this gate sent to the person on `page`, as their queue lists it. */
export async function requestOf(
  page: Page,
  org: string,
  gate: string,
): Promise<{ id: string; title: string }> {
  let found: { readonly id: string; readonly title: string } | undefined;
  await expect
    .poll(async () => {
      const mine = await callFromPage(
        page,
        'GET',
        '/api/v1/approvals?mine=true&status=pending',
        undefined,
        org,
      );
      found =
        mine.status === 200
          ? zListApprovalsResponse.parse(mine.body).items.find((item) => item.group === gate)
          : undefined;
      return found?.id;
    })
    .toBeDefined();
  return found ?? { id: '', title: '' };
}

/** Opens the request from the queue, as a person does: the queue, then its line. */
export async function openFromQueue(page: Page, approval: { id: string; title: string }): Promise<void> {
  await page.goto('/yes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Requests');
  await page.locator(`a[href$="/yes/${approval.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/yes/${approval.id}$`));
}

/** The owner of a new organization on `page`, and a second person who joined it with `role` on their own browser. */
export async function ownerAndMember(
  page: Page,
  other: Page,
  role: string,
): Promise<{ org: string; owner: string; member: string }> {
  const { id } = await ownerOfNewOrganization(page, 'ada');
  await joinAs(page, id, other, 'ben', role);
  return { org: id, owner: await loginOf(page), member: await loginOf(other) };
}
