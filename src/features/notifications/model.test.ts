// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  browserTimeZone,
  clockOf,
  isKnownKind,
  type PhoneForm,
  phoneFormOf,
  preferencesOf,
  quietHoursProblem,
  samePhoneForm,
  sentCount,
  switchRows,
  testRefusalOf,
} from './model';

describe('the switches', () => {
  it('knows the four kinds, not a newer one', () => {
    expect(isKnownKind('waiting')).toBe(true);
    expect(isKnownKind('budget_reached')).toBe(false);
  });

  it('lists the known kinds first, then the others, one cell per channel, on unless said off', () => {
    const rows = switchRows({
      channels: ['push', 'slack'],
      settings: [
        { channel: 'push', kind: 'budget_reached', enabled: true },
        { channel: 'push', kind: 'session_failed', enabled: false },
        { channel: 'push', kind: 'waiting', enabled: true },
        { channel: 'slack', kind: 'waiting', enabled: false },
      ],
    });
    expect(rows).toEqual([
      {
        kind: 'waiting',
        cells: [
          { channel: 'push', enabled: true },
          { channel: 'slack', enabled: false },
        ],
      },
      {
        kind: 'session_failed',
        cells: [
          { channel: 'push', enabled: false },
          { channel: 'slack', enabled: true },
        ],
      },
      {
        kind: 'budget_reached',
        cells: [
          { channel: 'push', enabled: true },
          { channel: 'slack', enabled: true },
        ],
      },
    ]);
  });
});

describe('the test push', () => {
  it('counts the phones that took it', () => {
    expect(
      sentCount({ ok: true, results: [{ status: 'sent' }, { status: 'retry' }, { status: 'sent' }] }),
    ).toBe(2);
  });

  it('reads the refusals it has words for', () => {
    const refused = (code?: string): Error => new ApiFailure('conflict', 'no', 409, undefined, code);
    expect(testRefusalOf(refused('push_off'))).toBe('off');
    expect(testRefusalOf(refused('push_no_device'))).toBe('noPhone');
    expect(testRefusalOf(refused('push_test_rate_limited'))).toBe('rateLimited');
    expect(testRefusalOf(refused('forbidden'))).toBeUndefined();
    expect(testRefusalOf(refused())).toBeUndefined();
    expect(testRefusalOf(new Error('down'))).toBeUndefined();
  });
});

describe('the phone form', () => {
  const form: PhoneForm = {
    requests: true,
    decisions: false,
    spending: true,
    quiet: true,
    start: '22:00',
    end: '07:00',
    timeZone: ' Europe/Paris ',
  };

  it('starts from the preferences, the night in the browser’s zone without quiet hours', () => {
    expect(phoneFormOf({ requests: true, decisions: true, spending: false }, 'Asia/Tokyo')).toEqual({
      requests: true,
      decisions: true,
      spending: false,
      quiet: false,
      start: '22:00',
      end: '07:00',
      timeZone: 'Asia/Tokyo',
    });
    expect(
      phoneFormOf(
        {
          requests: false,
          decisions: true,
          spending: true,
          quietHours: { start: '12:00', end: '13:30', timeZone: 'UTC' },
        },
        'Asia/Tokyo',
      ),
    ).toMatchObject({ quiet: true, start: '12:00', end: '13:30', timeZone: 'UTC' });
  });

  it('sends the quiet hours only when they are on', () => {
    expect(preferencesOf(form)).toEqual({
      requests: true,
      decisions: false,
      spending: true,
      quietHours: { start: '22:00', end: '07:00', timeZone: 'Europe/Paris' },
    });
    expect(preferencesOf({ ...form, quiet: false })).toEqual({
      requests: true,
      decisions: false,
      spending: true,
    });
  });

  it('says what the server would refuse in quiet hours', () => {
    expect(quietHoursProblem(form)).toBeUndefined();
    expect(quietHoursProblem({ ...form, quiet: false, start: '' })).toBeUndefined();
    expect(quietHoursProblem({ ...form, start: '' })).toBe('time');
    expect(quietHoursProblem({ ...form, end: '24:00' })).toBe('time');
    expect(quietHoursProblem({ ...form, end: '22:00' })).toBe('same');
    expect(quietHoursProblem({ ...form, timeZone: 'Paris time' })).toBe('zone');
  });

  it('reads the browser’s zone, UTC when it names none', () => {
    expect(browserTimeZone()).not.toBe('');
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: '',
    });
    expect(browserTimeZone()).toBe('UTC');
    spy.mockRestore();
  });
});

describe('the time fields', () => {
  it('drops the seconds a browser adds, and keeps anything else as typed', () => {
    expect(clockOf('22:00:00')).toBe('22:00');
    expect(clockOf('07:30:15.250')).toBe('07:30');
    expect(clockOf('07:30')).toBe('07:30');
    expect(clockOf('7')).toBe('7');
  });

  it('tells two forms apart by any of their fields', () => {
    const form: PhoneForm = {
      requests: true,
      decisions: true,
      spending: false,
      quiet: false,
      start: '22:00',
      end: '07:00',
      timeZone: 'UTC',
    };
    expect(samePhoneForm(form, { ...form })).toBe(true);
    for (const change of [
      { spending: true },
      { quiet: true },
      { start: '21:00' },
      { end: '06:00' },
      { timeZone: 'Europe/Paris' },
    ])
      expect(samePhoneForm(form, { ...form, ...change })).toBe(false);
  });
});
