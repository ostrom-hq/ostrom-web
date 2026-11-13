// SPDX-License-Identifier: Apache-2.0
import type { Wait, WaitField } from '@gen/api/types.gen';
import {
  actionsOf,
  answeredThroughSession,
  answerFor,
  countLabel,
  draftOf,
  draftsOf,
  isCalendarDate,
  isMemberId,
  isViewer,
  resolvesByItself,
  shownValue,
  styleOf,
  targetOf,
  valueOf,
  valueTypeOf,
  without,
} from './model';

const field = (extra: Partial<WaitField> & { readonly type: string }): WaitField => ({
  id: 'f',
  label: 'F',
  ...extra,
});

function waitWith(question: Partial<Wait['question']>, kind = 'human_request'): Wait {
  return {
    id: 'w',
    kind,
    status: 'open',
    assignee: 'a',
    createdAt: '2026-11-13T08:00:00.000Z',
    question: { title: 'T', ...question },
  };
}

describe('actions', () => {
  it('styles: primary and danger, else secondary', () => {
    expect(styleOf({ id: 'a', label: 'A', style: 'primary' })).toBe('primary');
    expect(styleOf({ id: 'a', label: 'A', style: 'danger' })).toBe('danger');
    expect(styleOf({ id: 'a', label: 'A', style: 'secondary' })).toBe('secondary');
    expect(styleOf({ id: 'a', label: 'A', style: 'fancy' })).toBe('secondary');
    expect(styleOf({ id: 'a', label: 'A' })).toBe('secondary');
  });

  it('are the wait’s own, else one “done”', () => {
    expect(actionsOf(waitWith({ actions: [{ id: 'ok', label: 'OK' }] }), 'Done')).toEqual([
      { id: 'ok', label: 'OK' },
    ]);
    expect(actionsOf(waitWith({ actions: [] }), 'Fait')).toEqual([
      { id: 'done', label: 'Fait', style: 'primary' },
    ]);
    expect(actionsOf(waitWith({}), 'Done')).toHaveLength(1);
  });

  it('resolves by itself unless a person is the resolver', () => {
    expect(resolvesByItself({ ...waitWith({}), resolver: 'event' })).toBe(true);
    expect(resolvesByItself({ ...waitWith({}), resolver: 'human' })).toBe(false);
    expect(resolvesByItself(waitWith({}))).toBe(false);
  });

  it('answers through the session for a cloud session’s own requests only', () => {
    expect(answeredThroughSession(waitWith({}, 'permission'))).toBe(true);
    expect(answeredThroughSession(waitWith({}, 'question'))).toBe(true);
    expect(answeredThroughSession(waitWith({}, 'human_request'))).toBe(false);
  });
});

describe('the first state of a field', () => {
  it('reads each default for its type, and ignores one of another type', () => {
    expect(draftOf(field({ type: 'text', default: 'x' })).text).toBe('x');
    expect(draftOf(field({ type: 'text', default: 3 })).text).toBe('');
    expect(draftOf(field({ type: 'date', default: '2026-01-02' })).text).toBe('2026-01-02');
    expect(draftOf(field({ type: 'number', default: 4.5 })).text).toBe('4.5');
    expect(draftOf(field({ type: 'number', default: '4' })).text).toBe('');
    expect(draftOf(field({ type: 'confirm', default: false })).text).toBe('false');
    expect(draftOf(field({ type: 'confirm' })).text).toBe('');
    expect(draftOf(field({ type: 'info' }))).toEqual({ text: '', picked: [], other: '' });
  });

  it('reads a choice: known options picked, a free answer only when allowed', () => {
    const options = ['a', 'b'];
    expect(draftOf(field({ type: 'choice', options, default: 'b' }))).toEqual({
      text: '',
      picked: ['b'],
      other: '',
    });
    expect(draftOf(field({ type: 'choice', options, default: ['a', 'b'] })).picked).toEqual(['a']);
    expect(
      draftOf(field({ type: 'choice', options, multiple: true, default: ['a', 'b', 3] })).picked,
    ).toEqual(['a', 'b']);
    expect(draftOf(field({ type: 'choice', options, default: 'zzz' }))).toEqual({
      text: '',
      picked: [],
      other: '',
    });
    expect(draftOf(field({ type: 'choice', options, allowOther: true, default: 'zzz' })).other).toBe('zzz');
    // One answer is either an option or a free one.
    expect(
      draftOf(field({ type: 'choice', options, allowOther: true, default: ['a', 'zzz'] })),
    ).toMatchObject({
      picked: ['a'],
      other: '',
    });
    expect(
      draftOf(field({ type: 'choice', options, allowOther: true, multiple: true, default: ['a', 'zzz'] })),
    ).toMatchObject({ picked: ['a'], other: 'zzz' });
    expect(draftOf(field({ type: 'choice', default: 'a' })).picked).toEqual([]);
  });

  it('keys the drafts by field id', () => {
    expect(
      Object.keys(draftsOf([field({ type: 'text', id: 'a' }), field({ type: 'info', id: 'b' })])),
    ).toEqual(['a', 'b']);
  });

  it('knows which types it fills', () => {
    expect(valueTypeOf(field({ type: 'date' }))).toBe('date');
    expect(valueTypeOf(field({ type: 'secret' }))).toBeUndefined();
  });
});

describe('the value of a field', () => {
  const draft = (text: string, picked: readonly string[] = [], other = '') => ({ text, picked, other });

  it('text: empty, too long (maxLength, 8000 by default), or the text', () => {
    expect(valueOf(field({ type: 'text' }), draft('  '))).toEqual({ kind: 'empty' });
    expect(valueOf(field({ type: 'text' }), undefined)).toEqual({ kind: 'empty' });
    expect(valueOf(field({ type: 'text', maxLength: 3 }), draft('abcd'))).toEqual({
      kind: 'invalid',
      problem: 'tooLong',
    });
    expect(valueOf(field({ type: 'text' }), draft('a'.repeat(8001)))).toEqual({
      kind: 'invalid',
      problem: 'tooLong',
    });
    expect(valueOf(field({ type: 'text', maxLength: 4 }), draft('abcd'))).toEqual({
      kind: 'value',
      value: 'abcd',
    });
  });

  it('number: a finite number', () => {
    expect(valueOf(field({ type: 'number' }), draft(''))).toEqual({ kind: 'empty' });
    expect(valueOf(field({ type: 'number' }), draft('-1.5e2'))).toEqual({ kind: 'value', value: -150 });
    expect(valueOf(field({ type: 'number' }), draft('abc'))).toEqual({
      kind: 'invalid',
      problem: 'notNumber',
    });
    expect(valueOf(field({ type: 'number' }), draft('0x1F'))).toEqual({
      kind: 'invalid',
      problem: 'notNumber',
    });
    expect(valueOf(field({ type: 'number' }), draft('.5'))).toEqual({ kind: 'value', value: 0.5 });
    expect(valueOf(field({ type: 'number' }), draft('Infinity'))).toEqual({
      kind: 'invalid',
      problem: 'notNumber',
    });
  });

  it('date: a real calendar day', () => {
    expect(valueOf(field({ type: 'date' }), draft(''))).toEqual({ kind: 'empty' });
    expect(valueOf(field({ type: 'date' }), draft('2026-02-28'))).toEqual({
      kind: 'value',
      value: '2026-02-28',
    });
    expect(valueOf(field({ type: 'date' }), draft('2026-02-30'))).toEqual({
      kind: 'invalid',
      problem: 'notDate',
    });
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('26-1-1')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
  });

  it('confirm: true or false, empty when not answered', () => {
    expect(valueOf(field({ type: 'confirm' }), draft(''))).toEqual({ kind: 'empty' });
    expect(valueOf(field({ type: 'confirm' }), draft('true'))).toEqual({ kind: 'value', value: true });
    expect(valueOf(field({ type: 'confirm' }), draft('false'))).toEqual({ kind: 'value', value: false });
  });

  it('choice: one value, or a list when multiple, with the free answer after the options', () => {
    const single = field({ type: 'choice', options: ['a', 'b'], allowOther: true });
    expect(valueOf(single, draft('', []))).toEqual({ kind: 'empty' });
    expect(valueOf(single, draft('', ['a']))).toEqual({ kind: 'value', value: 'a' });
    expect(valueOf(single, draft('', [], ' mine '))).toEqual({ kind: 'value', value: 'mine' });
    expect(valueOf(single, draft('', [], 'x'.repeat(501)))).toEqual({
      kind: 'invalid',
      problem: 'otherTooLong',
    });
    const multiple = field({ type: 'choice', options: ['a', 'b'], allowOther: true, multiple: true });
    expect(valueOf(multiple, draft('', ['a', 'b'], 'c'))).toEqual({ kind: 'value', value: ['a', 'b', 'c'] });
  });

  it('info and unknown types: nothing', () => {
    expect(valueOf(field({ type: 'info' }), draft('x'))).toEqual({ kind: 'empty' });
  });
});

describe('answerFor', () => {
  const fields: WaitField[] = [
    field({ id: 'why', type: 'text' }),
    field({ id: 'must', type: 'text', required: true }),
    field({ id: 'n', type: 'number' }),
    field({ id: 'help', type: 'info', required: true }),
  ];
  const ok = { text: 'x', picked: [], other: '' };

  it('collects the filled values, leaves the empty ones out', () => {
    expect(answerFor(fields, { must: ok }, { id: 'go', label: 'Go' })).toEqual({
      answer: { action: 'go', values: { must: 'x' } },
    });
  });

  it('refuses a missing required field, a missing field the action requires, and a bad value', () => {
    expect(answerFor(fields, {}, { id: 'go', label: 'Go' })).toEqual({ problems: { must: 'required' } });
    expect(answerFor(fields, { must: ok }, { id: 'go', label: 'Go', requires: ['why'] })).toEqual({
      problems: { why: 'required' },
    });
    expect(answerFor(fields, { must: ok, n: { ...ok, text: 'nope' } }, { id: 'go', label: 'Go' })).toEqual({
      problems: { n: 'notNumber' },
    });
  });

  it('drops one problem when the person fixes that field', () => {
    expect(without({ a: 'required', b: 'tooLong' }, 'a')).toEqual({ b: 'tooLong' });
  });
});

describe('refs', () => {
  it('opens an artifact or a session in the console, an https link outside, and nothing else', () => {
    expect(targetOf({ kind: 'artifact', id: 'a1' })).toEqual({ kind: 'artifact', id: 'a1' });
    expect(targetOf({ kind: 'session', id: 's1' })).toEqual({ kind: 'session', id: 's1' });
    expect(targetOf({ kind: 'url', url: 'https://x.dev' })).toEqual({
      kind: 'external',
      href: 'https://x.dev',
    });
    expect(targetOf({ kind: 'url', url: 'javascript:alert(1)' })).toBeUndefined();
    expect(targetOf({ kind: 'artifact' })).toBeUndefined();
    expect(targetOf({ kind: 'url' })).toBeUndefined();
  });
});

describe('small helpers', () => {
  it('shows a value as the form had it', () => {
    expect(shownValue('a')).toBe('a');
    expect(shownValue(['a', 2, true])).toBe('a, 2, true');
    expect(shownValue(false)).toBe('false');
    expect(shownValue({ k: 1 })).toBe('{"k":1}');
    expect(shownValue(null)).toBe('null');
  });

  it('knows the viewer by member id or login, whatever the case', () => {
    const viewer = { memberId: 'id-1', login: 'Maya' };
    expect(isViewer('id-1', viewer)).toBe(true);
    expect(isViewer('maya', viewer)).toBe(true);
    expect(isViewer('theo', viewer)).toBe(false);
    expect(isViewer(undefined, viewer)).toBe(false);
    expect(isViewer('maya', { memberId: undefined, login: undefined })).toBe(false);
  });

  it('tells a member id from a login', () => {
    expect(isMemberId('3d6f9a1e-2b4c-4d8e-9f0a-1b2c3d4e5f60')).toBe(true);
    expect(isMemberId('maya')).toBe(false);
  });

  it('writes the badge count', () => {
    expect(countLabel(3, false)).toBe('3');
    expect(countLabel(100, true)).toBe('100+');
  });
});
