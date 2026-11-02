// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmation } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  answerNoticeOf,
  changedKeys,
  formatCountdown,
  jsonLines,
  personName,
  remainingMs,
  shownStatus,
} from './model';

describe('personName', () => {
  it('names the person as best it can, never empty', () => {
    expect(personName({ memberId: 'm-1', login: 'maya', name: 'Maya Lind' })).toBe('Maya Lind (maya)');
    expect(personName({ memberId: 'm-1', login: 'maya' })).toBe('maya');
    expect(personName({ memberId: 'm-1', name: 'Maya Lind' })).toBe('Maya Lind');
    expect(personName({ memberId: 'm-1' })).toBe('m-1');
  });
});

describe('jsonLines', () => {
  it('marks the lines of each top-level key that changes, nested values indented under their key', () => {
    const lines = jsonLines({ a: 1, b: { c: [1] }, d: 'same' }, { a: 2, b: { c: [1] }, d: 'same' });
    expect(lines).toEqual([
      { text: '{', changed: false },
      { text: '  "a": 1,', changed: true },
      { text: '  "b": {', changed: false },
      { text: '    "c": [', changed: false },
      { text: '      1', changed: false },
      { text: '    ]', changed: false },
      { text: '  },', changed: false },
      { text: '  "d": "same"', changed: false },
      { text: '}', changed: false },
    ]);
  });

  it('reads a key only on one side as changed', () => {
    expect(jsonLines({ a: 1, extra: true }, { a: 1 }).map((line) => line.changed)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it('shows anything but two objects whole, changed or not', () => {
    expect(jsonLines([1], [2])).toEqual([
      { text: '[', changed: true },
      { text: '  1', changed: true },
      { text: ']', changed: true },
    ]);
    expect(jsonLines('same', 'same')).toEqual([{ text: '"same"', changed: false }]);
    expect(jsonLines({ a: 1 }, null)).toEqual([
      { text: '{', changed: true },
      { text: '  "a": 1', changed: true },
      { text: '}', changed: true },
    ]);
    expect(jsonLines({}, {})).toEqual([
      { text: '{', changed: false },
      { text: '}', changed: false },
    ]);
  });
});

describe('changedKeys', () => {
  it('lists the top-level keys written differently, from both sides', () => {
    expect(changedKeys({ a: 1, b: 2, gone: 0 }, { a: 1, b: 3, added: 1 })).toEqual(['b', 'gone', 'added']);
    expect(changedKeys(null, { a: 1 })).toEqual([]);
    expect(changedKeys({ a: 1 }, [1])).toEqual([]);
  });
});

describe('the countdown', () => {
  it('counts what is left, never below zero, and nothing for an unreadable date', () => {
    expect(remainingMs('2026-11-02T20:15:00Z', Date.parse('2026-11-02T20:00:00Z'))).toBe(900_000);
    expect(remainingMs('2026-11-02T20:15:00Z', Date.parse('2026-11-02T20:16:00Z'))).toBe(0);
    expect(remainingMs('soon', 0)).toBe(0);
  });

  it('reads as minutes and seconds, a started second counted whole', () => {
    expect(formatCountdown(900_000)).toBe('15:00');
    expect(formatCountdown(65_001)).toBe('1:06');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('shownStatus', () => {
  const base: GovernanceConfirmation = {
    id: 'gc-1',
    kind: 'gates.policy',
    status: 'pending',
    method: 'PUT',
    path: '/api/v1/gates/policy',
    scope: 'gates:policy',
    summary: 'Never',
    before: null,
    after: null,
    requestedBy: { memberId: 'm-1' },
    credential: 'admin',
    createdAt: '2026-11-02T20:00:00Z',
    expiresAt: '2026-11-02T20:15:00Z',
  };
  it('reads a pending one past its time as expired, and the rest as the server says', () => {
    expect(shownStatus(base, Date.parse('2026-11-02T20:10:00Z'))).toBe('pending');
    expect(shownStatus(base, Date.parse('2026-11-02T20:15:00Z'))).toBe('expired');
    expect(shownStatus({ ...base, status: 'confirmed' }, Date.parse('2026-11-02T21:00:00Z'))).toBe(
      'confirmed',
    );
  });
});

describe('answerNoticeOf', () => {
  const failure = (status: number | undefined, code?: string): ApiFailure =>
    new ApiFailure('unexpected', 'no', status, undefined, code);
  it('says why an answer was not taken', () => {
    expect(answerNoticeOf(failure(403, 'step_up_required'))).toBe('step-up');
    expect(answerNoticeOf(failure(403, 'forbidden'))).toBe('forbidden');
    expect(answerNoticeOf(failure(410, 'confirmation_expired'))).toBe('expired');
    expect(answerNoticeOf(failure(410))).toBe('expired');
    expect(answerNoticeOf(failure(409, 'confirmation_expired'))).toBe('expired');
    expect(answerNoticeOf(failure(409, 'confirmation_closed'))).toBe('closed');
    expect(answerNoticeOf(failure(409, 'confirmation_stale'))).toBe('stale');
    expect(answerNoticeOf(failure(409, 'version_conflict'))).toBe('failed');
    expect(answerNoticeOf(failure(400, 'invalid_rule'))).toBe('failed');
  });

  it('never blames the write for a sign-out, a missing confirmation, the server or the network', () => {
    expect(answerNoticeOf(failure(401))).toBe('error');
    expect(answerNoticeOf(failure(404))).toBe('error');
    expect(answerNoticeOf(failure(500))).toBe('error');
    expect(answerNoticeOf(failure(302))).toBe('error');
    expect(answerNoticeOf(failure(undefined))).toBe('error');
    expect(answerNoticeOf(new Error('offline'))).toBe('error');
  });
});
