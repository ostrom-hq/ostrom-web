// SPDX-License-Identifier: AGPL-3.0-only
// Line 3.1 of the journey (demo/PARCOURS.md), console side, against the real server and a fake GitHub
// (e2e-real/fakeGithub.ts): an owner installs the GitHub App, starts the analysis from /github, the server reads the
// repository through the installation (its files, CODEOWNERS, the protection of main), and the owner reviews what it
// proposes on /rules: accepts and rejects, each decision kept by the server. Nothing reaches GitHub.
import { createHash } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { pick } from 'zod/mini';
import { zRule } from '../gen/api/zod.gen';
import { FAKE_GITHUB_CONFIGURED, FakeGitHub } from './fakeGithub';
import { callFromPage, ownerOfNewOrganization } from './real';

const github = new FakeGitHub();

test.skip(
  !FAKE_GITHUB_CONFIGURED,
  'the server of this run points at no fake GitHub (ports and webhook secret)',
);
test.beforeAll(async () => {
  await github.start();
});
test.afterAll(async () => {
  await github.stop();
});

/** A name no other journey uses. */
function uniqueRun(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The rules of `org` as the server keeps them, read for what this journey checks. */
const zRules = z.object({
  items: z.array(pick(zRule, { id: true, statement: true, status: true, confidence: true })),
});

async function rulesOf(page: Page, org: string): Promise<z.infer<typeof zRules>['items']> {
  const read = await callFromPage(page, 'GET', '/api/v1/rules', undefined, org);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return zRules.parse(read.body).items;
}

/** What a repository a team works in holds: a pnpm project, its CI, its code owners, an infrastructure folder. */
const API_FILES: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'api',
      private: true,
      packageManager: 'pnpm@9.12.0',
      scripts: { build: 'tsc', test: 'vitest run' },
    },
    null,
    2,
  )}\n`,
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
  '.github/CODEOWNERS': '* @acme/core\n/infra/ @acme/ops\n',
  '.github/workflows/ci.yml':
    'name: ci\non: [pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm install --frozen-lockfile\n      - run: pnpm test\n',
  'infra/main.tf': 'terraform {\n  required_version = ">= 1.6"\n}\n',
  'src/index.ts': 'export const ready = true;\n',
};

test('3.1 an owner analyses the repositories from /github, then accepts and rejects the proposed rules', async ({
  page,
}) => {
  // Sign-in, install, an analysis of up to 90 s and the review: more than the default 30 s.
  test.setTimeout(180_000);
  const { id: org } = await ownerOfNewOrganization(page, 'ada');
  const run = uniqueRun();
  const account = `acme-${run}`;
  // An id drawn from the run, so the desktop and phone runs on one server almost never share one.
  const installation =
    100_000 + (Number.parseInt(createHash('sha256').update(run).digest('hex').slice(0, 6), 16) % 800_000);
  const admin = `ada-gh-${run}`;
  github.installation({
    id: installation,
    account,
    admins: [admin],
    repos: ['api'],
    files: { api: API_FILES },
    protections: { api: { checks: ['ci'], approvals: 1 } },
  });
  const { baseURL } = test.info().project.use;
  github.installs(installation, admin, `${baseURL ?? ''}/api/v1/github/app/install/callback`);

  await page.goto('/github');
  await page.getByRole('link', { name: 'Install on GitHub' }).click();
  await expect(page.getByText('The GitHub App is installed. Its repositories show below.')).toBeVisible();

  // The analysis, started and followed on the GitHub screen.
  const analysis = page.getByRole('region', { name: 'Rules from your repositories' });
  await analysis.getByRole('button', { name: 'Analyse the repositories' }).click();
  const done = analysis.getByText('The last analysis is done. Its proposals wait in Rules.');
  const stopped = analysis.getByText('The last analysis stopped.');
  await expect(done.or(stopped)).toBeVisible({ timeout: 90_000 });
  // A stopped analysis fails here, with the reason the screen gives, rather than as a timeout.
  await expect(stopped, (await analysis.textContent()) ?? '').toBeHidden();
  await expect(done).toBeVisible();
  const found = (await analysis.getByText(/ proposed\.$/).textContent()) ?? '';
  const said = Number(/^(\d+) rules?/.exec(found)?.[1] ?? '0');
  expect(said, found).toBeGreaterThan(0);

  // The server read this repository through the installation: main, its tree, its files, its rulesets.
  const read = github.requests.map((request) => request.path);
  expect(read).toContain(`/repos/${account}/api/branches/main`);
  expect(read.some((path) => path.startsWith(`/repos/${account}/api/git/trees/`))).toBe(true);
  expect(read.some((path) => path.startsWith(`/repos/${account}/api/contents/`))).toBe(true);
  expect(read).toContain(`/repos/${account}/api/rules/branches/main`);

  const proposed = (await rulesOf(page, org)).filter((rule) => rule.status === 'proposed');
  expect(proposed).toHaveLength(said);

  // Reviewed on /rules: what the analysis proposed waits there.
  await analysis.getByRole('link', { name: 'Review the rules' }).click();
  await expect(page).toHaveURL(/\/rules$/);
  const filters = page.getByRole('group', { name: 'Show' });
  await expect(filters.getByRole('button', { name: `To review ${String(said)}` })).toBeVisible();

  // One rejected, by its card.
  const [refused] = proposed;
  if (refused === undefined) throw new Error('no rule proposed');
  const refusedCard = page.getByRole('article', { name: refused.statement });
  await refusedCard.getByRole('button', { name: 'Reject' }).click();
  await expect(filters.getByRole('button', { name: 'Rejected 1' })).toBeVisible();

  // The rest accepted: in bulk for those the analysis is sure of, one by one for the others.
  const others = proposed.filter((rule) => rule.id !== refused.id);
  const sure = others.filter((rule) => rule.confidence >= 0.9);
  if (sure.length > 0) {
    await filters
      .getByRole('button', {
        name: `Accept the ${String(sure.length)} rule${sure.length === 1 ? '' : 's'} at 90 % or more`,
      })
      .click();
    await expect(
      page.getByText(`${String(sure.length)} rule${sure.length === 1 ? '' : 's'} accepted.`),
    ).toBeVisible();
  }
  for (const rule of others.filter((item) => item.confidence < 0.9)) {
    await page.getByRole('article', { name: rule.statement }).getByRole('button', { name: 'Accept' }).click();
  }
  await expect(filters.getByRole('button', { name: `Accepted ${String(others.length)}` })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'To review 0' })).toBeVisible();

  // Kept by the server, as decided.
  const decided = await rulesOf(page, org);
  expect(decided.find((rule) => rule.id === refused.id)?.status).toBe('rejected');
  for (const rule of others) expect(decided.find((item) => item.id === rule.id)?.status).toBe('accepted');
});
