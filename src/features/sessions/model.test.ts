// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gen/api/types.gen';
import {
  budgetDraftOf,
  budgetMicrosOf,
  launchConcurrencyOf,
  MAX_LABELS,
  MAX_LAUNCH_BUDGET_MICROS,
  parseLabelFilter,
  sessionActivity,
  sessionLabels,
  sessionState,
} from './model';

const base: Session = { id: 's', agent: 'codex', dev: 'maya', startedAt: '2026-10-30T08:00:00.000Z' };
const at = (iso: string): Date => new Date(iso);

describe('sessionState', () => {
  it('reads an ended session as ended', () => {
    expect(
      sessionState({ ...base, endedAt: '2026-10-30T09:00:00.000Z' }, at('2026-10-30T09:01:00.000Z')),
    ).toBe('ended');
  });

  it('is live within five minutes of the last report, quiet after', () => {
    const seen = { ...base, lastSeenAt: '2026-10-30T08:30:00.000Z' };
    expect(sessionState(seen, at('2026-10-30T08:35:00.000Z'))).toBe('live');
    expect(sessionState(seen, at('2026-10-30T08:35:01.000Z'))).toBe('quiet');
  });

  it('counts from the start when the session never reported', () => {
    expect(sessionState(base, at('2026-10-30T08:04:00.000Z'))).toBe('live');
    expect(sessionState(base, at('2026-10-30T08:10:00.000Z'))).toBe('quiet');
  });
});

describe('sessionActivity', () => {
  it('says whether the agent of an open session works or waits for a person', () => {
    expect(sessionActivity({ ...base, activity: 'working' })).toBe('working');
    expect(sessionActivity({ ...base, activity: 'waiting_for_human' })).toBe('waiting');
  });

  it('says nothing without a report, for an unknown state or once the session ended', () => {
    expect(sessionActivity(base)).toBeUndefined();
    expect(sessionActivity({ ...base, activity: 'thinking' })).toBeUndefined();
    expect(
      sessionActivity({ ...base, activity: 'waiting_for_human', endedAt: '2026-10-30T09:00:00.000Z' }),
    ).toBeUndefined();
  });
});

describe('labels (sessions.labels.v1)', () => {
  it('lists a launch’s labels by key, as key=value', () => {
    expect(sessionLabels(base)).toEqual([]);
    expect(sessionLabels({ ...base, labels: { team: 'core', env: 'ci' } })).toEqual(['env=ci', 'team=core']);
  });

  it('splits a filter at spaces and commas, the key being what precedes the first =', () => {
    expect(parseLabelFilter(' team=core,env=ci  task=a=b ')).toEqual({
      labels: ['team=core', 'env=ci', 'task=a=b'],
      invalid: [],
    });
    expect(parseLabelFilter('')).toEqual({ labels: [], invalid: [] });
  });

  it('names what is not a label, and keeps at most 16', () => {
    expect(parseLabelFilter('novalue Team=x =x ok=1').invalid).toEqual(['novalue', 'Team=x', '=x']);
    const many = Array.from({ length: 17 }, (_, n) => `k${String(n)}=v`).join(' ');
    const parsed = parseLabelFilter(many);
    expect(parsed.labels).toHaveLength(MAX_LABELS);
    expect(parsed.invalid).toEqual(['k16=v']);
  });
});

describe('a launch’s limits', () => {
  it('shows the budget in USD and reads it back as millionths', () => {
    expect(budgetDraftOf(0)).toBe('0');
    expect(budgetDraftOf(1_500_000)).toBe('1.5');
    expect(budgetMicrosOf('1.5')).toBe(1_500_000);
    expect(budgetMicrosOf(' 0.000001 ')).toBe(1);
    expect(budgetMicrosOf('100000000')).toBe(MAX_LAUNCH_BUDGET_MICROS);
  });

  it('refuses what is not an amount in range', () => {
    for (const draft of ['', 'x', '-1', '1.0000001', '100000000.01', '1e3', '1,5']) {
      expect(budgetMicrosOf(draft), draft).toBeUndefined();
    }
  });

  it('takes 0 to 32 calls at once, whole', () => {
    expect(launchConcurrencyOf('0')).toBe(0);
    expect(launchConcurrencyOf(' 32 ')).toBe(32);
    for (const draft of ['', '33', '-1', '1.5', 'x'])
      expect(launchConcurrencyOf(draft), draft).toBeUndefined();
  });
});
