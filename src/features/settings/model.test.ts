// SPDX-License-Identifier: AGPL-3.0-only
import type { AuthSession } from '@gen/api/types.gen';
import { browserTimeZone, deletionConfirmed, renameProblem, sortSessions } from './model';

describe('renameProblem', () => {
  it('takes a new name of 1 to 100 characters', () => {
    expect(renameProblem('   ', 'Acme')).toBe('empty');
    expect(renameProblem('x'.repeat(101), 'Acme')).toBe('long');
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
