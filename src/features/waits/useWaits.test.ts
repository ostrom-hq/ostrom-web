// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import { firstPagePoll, isWaitList, refusalOf, WAITS_POLL_MS } from './useWaits';

describe('refusalOf', () => {
  it('reads a 409 as closed meanwhile, a 400 as the server’s message, and anything else as not done', () => {
    expect(refusalOf(new ApiFailure('conflict', 'closed', 409, undefined, 'wait_closed'))).toEqual({
      kind: 'closed',
      message: 'closed',
    });
    expect(refusalOf(new ApiFailure('bad-request', 'no such action', 400, undefined))).toEqual({
      kind: 'invalid',
      message: 'no such action',
    });
    expect(refusalOf(new ApiFailure('server', 'HTTP 500', 500, undefined))).toEqual({
      kind: 'other',
      message: 'HTTP 500',
    });
    expect(refusalOf(new Error('boom'))).toEqual({ kind: 'other', message: 'boom' });
  });
});

describe('firstPagePoll', () => {
  it('polls while only the first page is read, never once older pages are (each poll would read them all)', () => {
    expect(firstPagePoll({ state: { error: null } })).toBe(WAITS_POLL_MS);
    expect(firstPagePoll({ state: { error: null, data: { pages: [{}] } } })).toBe(WAITS_POLL_MS);
    expect(firstPagePoll({ state: { error: null, data: { pages: [{}, {}] } } })).toBe(false);
    expect(firstPagePoll({ state: { error: null, data: 'x' } })).toBe(WAITS_POLL_MS);
  });

  it('stops on a refusal', () => {
    expect(
      firstPagePoll({ state: { error: new ApiFailure('forbidden', 'no', 403, undefined), data: undefined } }),
    ).toBe(false);
  });
});

describe('isWaitList', () => {
  it('recognises the keys of the wait lists, of any filter', () => {
    expect(isWaitList([{ _id: 'listWaits', query: { status: 'open' } }])).toBe(true);
    expect(isWaitList([{ _id: 'getWait' }])).toBe(false);
    expect(isWaitList(['listWaits'])).toBe(false);
    expect(isWaitList([null])).toBe(false);
    expect(isWaitList([])).toBe(false);
  });
});
