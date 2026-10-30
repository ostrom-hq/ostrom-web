// SPDX-License-Identifier: AGPL-3.0-only
import type { Repo } from '@gen/api/types.gen';
import { installErrorOf, reposShown, stageOf } from './model';

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
    expect(installErrorOf('denied')).toBe('denied');
    expect(installErrorOf('state_mismatch')).toBe('unknown');
  });
});
