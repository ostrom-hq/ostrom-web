// SPDX-License-Identifier: Apache-2.0
import type { CloudSession } from '@gen/api/types.gen';
import {
  checkRecipe,
  EMPTY_RECIPE,
  EMPTY_REPOSITORY,
  PREPARATION_PHASES,
  preparationAdvice,
  preparationOf,
  type RecipeDraft,
} from './recipe';

const WEB = { ...EMPTY_REPOSITORY, url: 'https://github.com/acme/web' };

function draft(change: Partial<RecipeDraft>): RecipeDraft {
  return { ...EMPTY_RECIPE, ...change };
}

function problemOf(change: Partial<RecipeDraft>, repo = ''): string | undefined {
  const checked = checkRecipe(draft(change), repo);
  return 'problem' in checked ? checked.problem : undefined;
}

describe('a preparation recipe', () => {
  it('sends nothing when it asks for nothing, blank repository rows included', () => {
    expect(checkRecipe(EMPTY_RECIPE, '')).toEqual({ environment: undefined });
    expect(checkRecipe(draft({ repositories: [EMPTY_REPOSITORY], create: ' \n ' }), 'acme/web')).toEqual({
      environment: undefined,
    });
  });

  it('sends what was typed, trimmed, and only that', () => {
    expect(
      checkRecipe(
        draft({
          repositories: [
            {
              url: ' https://github.com/acme/web.git ',
              path: ' apps/web ',
              ref: 'main',
              branch: 'agent/one',
            },
            WEB,
          ],
          workingDirectory: 'apps/web',
          create: 'pnpm install\n\n  pnpm build  ',
          start: 'docker compose up -d',
          requiredVariables: 'NPM_TOKEN, SENTRY_DSN\nGITHUB_TOKEN',
          requireGitHub: true,
          gitEmailDomain: 'acme.dev',
        }),
        '',
      ),
    ).toEqual({
      environment: {
        repositories: [
          { url: 'https://github.com/acme/web.git', path: 'apps/web', ref: 'main', branch: 'agent/one' },
          { url: 'https://github.com/acme/web' },
        ],
        workingDirectory: 'apps/web',
        setup: { create: ['pnpm install', 'pnpm build'], start: ['docker compose up -d'] },
        requiredVariables: ['NPM_TOKEN', 'SENTRY_DSN', 'GITHUB_TOKEN'],
        requireGitHub: true,
        gitEmailDomain: 'acme.dev',
      },
    });
    expect(checkRecipe(draft({ create: 'make deps' }), '')).toEqual({
      environment: { setup: { create: ['make deps'] } },
    });
    expect(checkRecipe(draft({ start: 'make dev' }), '')).toEqual({
      environment: { setup: { start: ['make dev'] } },
    });
  });

  it('never names repositories together with the older single repository', () => {
    expect(problemOf({ repositories: [WEB] }, 'https://github.com/acme/api')).toBe('both');
    // A recipe without repositories goes with it.
    expect(checkRecipe(draft({ requireGitHub: true }), 'https://github.com/acme/api')).toEqual({
      environment: { requireGitHub: true },
    });
  });

  it('says what the server would refuse', () => {
    expect(
      problemOf({
        repositories: Array.from({ length: 17 }, (_, at) => ({ ...WEB, path: `r${String(at)}` })),
      }),
    ).toBe('repositories');
    for (const url of [
      'http://github.com/acme/web',
      'https://gitlab.com/acme/web',
      'https://u:p@github.com/a/b',
    ])
      expect(problemOf({ repositories: [{ ...WEB, url }] })).toBe('url');
    for (const path of [
      '.ostrom',
      '/abs',
      'a/../b',
      Array.from({ length: 9 }, () => 'a').join('/'),
      'x'.repeat(256),
    ])
      expect(problemOf({ repositories: [{ ...WEB, path }] })).toBe('path');
    expect(problemOf({ workingDirectory: '.home' })).toBe('path');
    for (const ref of ['-x', '/x', 'x/', 'x.lock', 'a..b', 'a//b', 'a b'])
      expect(problemOf({ repositories: [{ ...WEB, ref }] })).toBe('ref');
    expect(problemOf({ repositories: [{ ...WEB, branch: '--force' }] })).toBe('ref');
    expect(
      problemOf({ repositories: [WEB, { ...WEB, url: 'https://github.com/acme/api', path: 'web/api' }] }),
    ).toBe('nested');
    expect(problemOf({ repositories: [WEB, { ...WEB, path: 'web/' }] })).toBe('nested');
    expect(problemOf({ create: Array.from({ length: 17 }, () => 'true').join('\n') })).toBe('commands');
    expect(problemOf({ start: 'x'.repeat(4097) })).toBe('commands');
    expect(problemOf({ start: 'a\u0000b' })).toBe('commands');
    expect(problemOf({ requiredVariables: 'npm_token' })).toBe('variables');
    expect(problemOf({ requiredVariables: 'A A' })).toBe('variables');
    expect(
      problemOf({ requiredVariables: Array.from({ length: 65 }, (_, at) => `V${String(at)}`).join(' ') }),
    ).toBe('variables');
    expect(problemOf({ gitEmailDomain: 'Acme.dev' })).toBe('domain');
    expect(
      problemOf({ repositories: [{ ...WEB, path: 'web/', ref: 'v1.2', branch: 'feat/x' }] }),
    ).toBeUndefined();
  });
});

describe('a session being prepared', () => {
  const session: CloudSession = { id: 'cs', owner: 'maya', agent: 'claude', status: 'queued', createdAt: '' };

  it('names the phases of the contract, and only those', () => {
    expect(PREPARATION_PHASES).toEqual([
      'configuring_git',
      'cloning_repositories',
      'fetching_repositories',
      'running_setup',
    ]);
    expect(preparationOf({ ...session, phase: 'running_setup' })).toBe('running_setup');
    expect(preparationOf({ ...session, phase: 'scheduling' })).toBeUndefined();
    expect(preparationOf(session)).toBeUndefined();
  });

  it('says to try again only when the server says it may pass', () => {
    const failed = (retryable?: boolean): CloudSession => ({
      ...session,
      failure: {
        code: 'preparation_failed',
        message: 'x',
        ...(retryable === undefined ? {} : { retryable }),
      },
    });
    expect(preparationAdvice(failed(true))).toBe('retry');
    expect(preparationAdvice(failed(false))).toBe('fix');
    expect(preparationAdvice(failed())).toBe('fix');
    expect(
      preparationAdvice({ ...session, failure: { code: 'idle_timeout', message: 'x' } }),
    ).toBeUndefined();
    expect(preparationAdvice(session)).toBeUndefined();
  });
});
