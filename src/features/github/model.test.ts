// SPDX-License-Identifier: Apache-2.0
import type { OrgMember, Repo } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  ANALYSIS_POLL_MS,
  ANALYSIS_RETRY_MS,
  analysisPollDelay,
  githubSearchSchema,
  linkRows,
  linkUrl,
  memberLinkUrl,
  readableDate,
  reposShown,
  safeAppPage,
  stageOf,
} from './model';

function repo(name: string, extra: Partial<Repo> = {}): Repo {
  return { name, defaultBranch: 'main', archived: false, ...extra };
}

describe('the repositories shown', () => {
  it('puts live ones first, the latest pushed first, then by name', () => {
    const shown = reposShown(
      [
        repo('old', { archived: true, pushedAt: '2026-10-30T00:00:00Z' }),
        repo('b', { pushedAt: '2026-10-01T00:00:00Z' }),
        repo('a', { pushedAt: '2026-10-01T00:00:00Z' }),
        repo('never'),
        repo('new', { pushedAt: '2026-10-29T00:00:00Z' }),
        repo('older', { archived: true }),
      ],
      '',
    );
    expect(shown.map((item) => item.name)).toEqual(['new', 'a', 'b', 'never', 'old', 'older']);
  });

  it('compares push dates as times, whatever their offset, and a date that is not one as never pushed', () => {
    const shown = reposShown(
      [
        repo('paris', { pushedAt: '2026-10-30T01:00:00+02:00' }),
        repo('utc', { pushedAt: '2026-10-29T23:30:00Z' }),
        repo('garbled', { pushedAt: 'soon' }),
      ],
      '',
    );
    expect(shown.map((item) => item.name)).toEqual(['utc', 'paris', 'garbled']);
  });

  it('keeps the ones whose name or description holds every word', () => {
    const repos = [repo('api', { description: 'Billing API' }), repo('billing-web'), repo('docs')];
    expect(reposShown(repos, ' billing ').map((item) => item.name)).toEqual(['api', 'billing-web']);
    expect(reposShown(repos, 'billing api').map((item) => item.name)).toEqual(['api']);
  });
});

describe('the analysis stage', () => {
  it('reads the phase', () => {
    expect(stageOf({})).toBe('never');
    expect(stageOf({ phase: 'ready' })).toBe('ready');
    expect(stageOf({ phase: 'failed' })).toBe('failed');
    expect(stageOf({ phase: 'connect' })).toBe('running');
  });
});

describe('an install error', () => {
  it('is one the console words, or unknown', () => {
    expect(githubSearchSchema.parse({ error: 'denied' })).toEqual({ error: 'denied' });
    expect(githubSearchSchema.parse({ error: 'state_mismatch' })).toEqual({ error: 'unknown' });
    expect(githubSearchSchema.parse({ error: 42 })).toEqual({ error: 'unknown' });
    expect(githubSearchSchema.parse({})).toEqual({});
  });
});

describe('what comes from outside', () => {
  it('reads an installation only from 1, as the server sends it, or from its own true', () => {
    expect(githubSearchSchema.parse({ installed: 1 })).toEqual({ installed: true });
    expect(githubSearchSchema.parse({ installed: '1' })).toEqual({ installed: true });
    expect(githubSearchSchema.parse({ installed: true })).toEqual({ installed: true });
    expect(githubSearchSchema.parse({ installed: 0 })).toEqual({ installed: false });
    expect(githubSearchSchema.parse({ installed: 'false' })).toEqual({ installed: false });
  });

  it('links the App page only over https', () => {
    expect(safeAppPage('https://github.com/apps/ostrom')).toBe('https://github.com/apps/ostrom');
    expect(safeAppPage('http://github.com/apps/ostrom')).toBeUndefined();
    expect(safeAppPage('javascript:alert(1)')).toBeUndefined();
    expect(safeAppPage(undefined)).toBeUndefined();
  });

  it('reads a date, and nothing from a date that is not one', () => {
    expect(readableDate('2026-10-29T17:42:00Z', 'en')).toBe('Oct 29, 2026');
    expect(readableDate('yesterday', 'en')).toBeUndefined();
  });
});

describe('the poll of a run', () => {
  const running = { phase: 'connect', repos: [], rules: [], workflows: [] };

  it('reads a run as it goes, and nothing else', () => {
    expect(analysisPollDelay(running, null)).toBe(ANALYSIS_POLL_MS);
    expect(analysisPollDelay({ ...running, phase: 'ready' }, null)).toBe(false);
    expect(analysisPollDelay(undefined, null)).toBe(false);
  });

  it('slows down after a server error, the network, a timeout, a rate limit or a route missing midway, and goes on', () => {
    for (const failure of [
      new ApiFailure('server', 'down', 503, undefined),
      new ApiFailure('network', 'gone', undefined, undefined),
      new ApiFailure('unexpected', 'too slow', 408, undefined),
      new ApiFailure('unexpected', 'too early', 425, undefined),
      new ApiFailure('unexpected', 'slow down', 429, undefined),
      new ApiFailure('not-found', 'deploying', 404, undefined),
      new Error('odd'),
    ])
      expect(analysisPollDelay(running, failure)).toBe(ANALYSIS_RETRY_MS);
  });

  it('stops on a refusal that reading again does not change', () => {
    for (const failure of [
      new ApiFailure('unauthorized', 'signed out', 401, undefined),
      new ApiFailure('forbidden', 'no longer admin', 403, undefined),
      new ApiFailure('bad-request', 'bad request', 400, undefined),
      new ApiFailure('conflict', 'org required', 409, undefined),
      new ApiFailure('unexpected', 'gone', 410, undefined),
      new ApiFailure('bad-request', 'unprocessable', 422, undefined),
    ])
      expect(analysisPollDelay(running, failure)).toBe(false);
  });
});

describe('the web link', () => {
  it('reads linked=1 as a link and the link error types as themselves', () => {
    expect(githubSearchSchema.parse({ linked: '1' }).linked).toBe(true);
    expect(githubSearchSchema.parse({ linked: '0' }).linked).toBe(false);
    expect(githubSearchSchema.parse({ error: 'github_account_in_use' }).error).toBe('github_account_in_use');
    expect(githubSearchSchema.parse({ error: 'anything else' }).error).toBe('unknown');
  });

  it('names the organization in the address of each start, which a navigation cannot header', () => {
    expect(linkUrl('org-1')).toMatch(/\/api\/v1\/github\/link\/start\?org=org-1$/);
    expect(memberLinkUrl('org-1', 'a/b')).toMatch(/\/api\/v1\/github\/links\/a%2Fb\/start\?org=org-1$/);
  });

  it('joins members and links in the order the members were read, a member with no link being not linked', () => {
    const member = (id: string, login: string): OrgMember => ({
      id,
      login,
      name: login,
      avatarUrl: '',
      email: null,
      role: 'member',
      joinedAt: '2026-10-01T00:00:00Z',
    });
    const rows = linkRows(
      [member('2', 'zoe'), member('1', 'ann')],
      [
        {
          memberId: '2',
          state: 'linked',
          appConfigured: true,
          login: 'zoe-gh',
          linkedAt: '2026-10-02T00:00:00Z',
        },
      ],
    );
    expect(rows.map((row) => [row.member.login, row.state, row.login])).toEqual([
      ['zoe', 'linked', 'zoe-gh'],
      ['ann', 'not_linked', undefined],
    ]);
  });
});
