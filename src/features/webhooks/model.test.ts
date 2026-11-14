// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  isStaleVersion,
  lastAnswer,
  toggleEventType,
  utcTime,
  WEBHOOK_EVENT_TYPES,
  webhookDraftProblem,
} from './model';

describe('webhookDraftProblem', () => {
  it('asks for an https URL of at most 2048 characters, and one event at least', () => {
    expect(webhookDraftProblem('https://example.com/hook', ['cloud.todo'])).toBeUndefined();
    expect(webhookDraftProblem('  https://example.com/hook  ', ['cloud.todo'])).toBeUndefined();
    expect(webhookDraftProblem('', ['cloud.todo'])).toBe('url');
    expect(webhookDraftProblem('http://example.com/hook', ['cloud.todo'])).toBe('url');
    expect(webhookDraftProblem('https://exa mple.com', ['cloud.todo'])).toBe('url');
    expect(webhookDraftProblem(`https://example.com/${'a'.repeat(2048)}`, ['cloud.todo'])).toBe('url');
    expect(webhookDraftProblem('https://example.com/hook', [])).toBe('types');
  });
});

describe('toggleEventType', () => {
  it('adds and removes a type, keeping the form’s order and a type it does not know last', () => {
    expect(toggleEventType(['cloud.todo'], 'cloud.wait.created', true)).toEqual([
      'cloud.wait.created',
      'cloud.todo',
    ]);
    expect(toggleEventType(['cloud.todo', 'x.future'], 'cloud.wait.created', true)).toEqual([
      'cloud.wait.created',
      'cloud.todo',
      'x.future',
    ]);
    expect(toggleEventType(['a.one', 'b.two'], 'c.three', true)).toEqual(['a.one', 'b.two', 'c.three']);
    expect(toggleEventType([...WEBHOOK_EVENT_TYPES], 'cloud.todo', false)).toEqual(
      WEBHOOK_EVENT_TYPES.filter((type) => type !== 'cloud.todo'),
    );
  });
});

describe('isStaleVersion', () => {
  it('is the server’s stale_version, and nothing else', () => {
    expect(isStaleVersion(new ApiFailure('conflict', 'stale', 409, undefined, 'stale_version'))).toBe(true);
    expect(isStaleVersion(new ApiFailure('conflict', 'other', 409, undefined, 'webhook_limit'))).toBe(false);
    expect(isStaleVersion(new Error('boom'))).toBe(false);
    expect(isStaleVersion(undefined)).toBe(false);
  });
});

describe('lastAnswer', () => {
  const base = {
    id: 'd',
    eventType: 'cloud.todo',
    state: 'failed',
    attempts: 1,
    createdAt: 'x',
    test: false,
  };
  it('says the status, the short error code, both, or nothing', () => {
    expect(lastAnswer({ ...base, lastStatus: 503 })).toBe('503');
    expect(lastAnswer({ ...base, lastError: 'timeout' })).toBe('timeout');
    expect(lastAnswer({ ...base, lastStatus: 500, lastError: 'expired' })).toBe('500 expired');
    expect(lastAnswer(base)).toBe('');
  });
});

describe('utcTime', () => {
  it('writes a UTC time to the second, and leaves an unreadable one as it came', () => {
    expect(utcTime('2026-11-14T09:30:12.345+01:00')).toBe('2026-11-14 08:30:12');
    expect(utcTime('soon')).toBe('soon');
  });
});
