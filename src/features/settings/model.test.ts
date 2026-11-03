// SPDX-License-Identifier: AGPL-3.0-only
import type { AuthSession, Device } from '@gen/api/types.gen';
import {
  browserTimeZone,
  deletionConfirmed,
  renameProblem,
  serviceKeyDraftProblem,
  serviceKeyLifetimeOf,
  sortDevices,
  sortSessions,
  toggleServiceKeyScope,
} from './model';

describe('renameProblem', () => {
  it('takes a new name of 1 to 100 characters, without control characters', () => {
    expect(renameProblem('   ', 'Acme')).toBe('empty');
    expect(renameProblem('x'.repeat(101), 'Acme')).toBe('long');
    expect(renameProblem('Ac\u0007me', 'Acme')).toBe('control');
    expect(renameProblem(' Acme ', 'Acme')).toBe('same');
    expect(renameProblem('Acme Labs', 'Acme')).toBeUndefined();
  });
});

describe('deletionConfirmed', () => {
  it('needs the short name exactly', () => {
    expect(deletionConfirmed('acme', 'acme')).toBe(true);
    expect(deletionConfirmed('Acme', 'acme')).toBe(false);
    expect(deletionConfirmed(' acme', 'acme')).toBe(false);
  });
});

describe('sortSessions', () => {
  it('puts this browser first, then the most recently seen', () => {
    const at = (id: string, createdAt: string, lastSeenAt?: string, current = false): AuthSession =>
      lastSeenAt === undefined ? { id, createdAt, current } : { id, createdAt, lastSeenAt, current };
    const sorted = sortSessions([
      at('old', '2026-10-01T00:00:00Z'),
      at('phone', '2026-10-02T00:00:00Z', '2026-10-29T00:00:00Z'),
      at('here', '2026-10-30T00:00:00Z', '2026-10-30T00:00:00Z', true),
      at('fresh', '2026-10-29T12:00:00Z'),
    ]);
    expect(sorted.map((session) => session.id)).toEqual(['here', 'fresh', 'phone', 'old']);
  });
});

describe('browserTimeZone', () => {
  it('names an IANA zone', () => {
    expect(browserTimeZone()).toMatch(/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)*$/);
  });
});

describe('sortDevices', () => {
  it('puts the most recently seen first, then the ones never seen by name', () => {
    const devices: Device[] = [
      { id: 'a', name: 'zeta' },
      { id: 'b', name: 'old', lastSeenAt: '2026-10-01T00:00:00Z' },
      { id: 'c', name: 'alpha' },
      { id: 'd', name: 'new', lastSeenAt: '2026-10-30T00:00:00Z' },
    ];
    expect(sortDevices(devices).map((device) => device.name)).toEqual(['new', 'old', 'alpha', 'zeta']);
  });
});

describe('serviceKeyDraftProblem', () => {
  it('needs a name of 1 to 100 characters, then a scope', () => {
    expect(serviceKeyDraftProblem('  ', ['rules:read'])).toBe('name');
    expect(serviceKeyDraftProblem('x'.repeat(101), ['rules:read'])).toBe('name');
    expect(serviceKeyDraftProblem('CI', [])).toBe('scopes');
    expect(serviceKeyDraftProblem(' CI ', ['rules:read'])).toBeUndefined();
  });
});

describe('toggleServiceKeyScope', () => {
  it('adds and takes away a scope, in the catalogue’s order', () => {
    const both = toggleServiceKeyScope(['rules:read'], 'sessions:write', true);
    expect(both).toEqual(['sessions:write', 'rules:read']);
    expect(toggleServiceKeyScope(both, 'sessions:write', false)).toEqual(['rules:read']);
  });
});

describe('serviceKeyLifetimeOf', () => {
  it('reads a select value, never as the default when it says never', () => {
    expect(serviceKeyLifetimeOf('366')).toBe(366);
    expect(serviceKeyLifetimeOf('null')).toBeNull();
    expect(serviceKeyLifetimeOf('12')).toBe(90);
  });
});
