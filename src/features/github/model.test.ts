// SPDX-License-Identifier: AGPL-3.0-only
import type { Repo } from '@gen/api/types.gen';
import { githubSearchSchema, readableDate, reposShown, safeAppPage, stageOf } from './model';

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
