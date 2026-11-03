// SPDX-License-Identifier: AGPL-3.0-only
import type { Group, SharedAccount } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { isGone, lentAccounts, pauseEndIn, pauseEndOn, pausedUntil, personOf, toggled } from './groups';

const now = new Date('2026-11-03T10:00:00.000Z');

const account = (id: string, label: string): SharedAccount => ({
  id,
  provider: 'anthropic',
  label,
  owner: 'maya',
  status: 'active',
  sharedWith: [],
  paused: false,
});

describe('the groups model', () => {
  it('ends a pause a day or a week from now', () => {
    expect(pauseEndIn('day', now)).toBe('2026-11-04T10:00:00.000Z');
    expect(pauseEndIn('week', now)).toBe('2026-11-10T10:00:00.000Z');
  });

  it('ends a pause until a day as that day does, and takes no day already over', () => {
    // The tests read dates in UTC (vite.config.ts): midnight there.
    expect(pauseEndOn('2026-11-05', now)).toBe('2026-11-06T00:00:00.000Z');
    expect(pauseEndOn('2026-11-03', now)).toBe('2026-11-04T00:00:00.000Z');
    expect(pauseEndOn('2026-11-02', now)).toBeUndefined();
    expect(pauseEndOn('', now)).toBeUndefined();
    expect(pauseEndOn('next week', now)).toBeUndefined();
  });

  it('says until when a member is paused, and nothing for one who is not or a group with no pause', () => {
    const group: Group = {
      id: 'g',
      name: 'Platform',
      members: ['theo', 'samir'],
      accounts: [],
      paused: [{ login: 'theo', until: '2026-11-04T10:00:00.000Z' }],
    };
    expect(pausedUntil(group, 'theo')).toBe('2026-11-04T10:00:00.000Z');
    expect(pausedUntil(group, 'samir')).toBeUndefined();
    expect(pausedUntil({ id: 'h', name: 'Bare', members: ['theo'], accounts: [] }, 'theo')).toBeUndefined();
  });

  it('names the subscriptions lent in their order, leaving out one the person cannot read', () => {
    const accounts = [account('a', 'Max'), account('b', 'Pro')];
    expect(lentAccounts(['b', 'gone', 'a'], accounts).map((item) => item.label)).toEqual(['Pro', 'Max']);
    expect(lentAccounts([], accounts)).toEqual([]);
  });

  it('names a member by name and login, or by login alone when the name says nothing more', () => {
    const member = {
      login: 'lena',
      name: 'Lena Ortiz',
      avatarUrl: '',
      email: null,
      role: 'owner',
      joinedAt: '',
    };
    expect(personOf(member)).toBe('Lena Ortiz (lena)');
    expect(personOf({ ...member, name: '' })).toBe('lena');
    expect(personOf({ ...member, name: 'lena' })).toBe('lena');
  });

  it('reads only a 404 as a group that is gone', () => {
    expect(isGone(new ApiFailure('not-found', 'Group not found.', 404, undefined))).toBe(true);
    expect(isGone(new ApiFailure('forbidden', 'no', 403, undefined))).toBe(false);
    expect(isGone(new Error('offline'))).toBe(false);
    expect(isGone(undefined)).toBe(false);
  });

  it('ticks a value on once, at the end, and off', () => {
    expect(toggled(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(toggled(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(toggled(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});
