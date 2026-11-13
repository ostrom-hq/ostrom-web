// SPDX-License-Identifier: Apache-2.0
import { checkRouteBudgets } from '@/shared/build/routeBudget';

describe('checkRouteBudgets', () => {
  it('passes routes within their budget, at their budget too', () => {
    expect(
      checkRouteBudgets(
        [
          { path: '/rules', ownKiB: 7.5 },
          { path: '/spend', ownKiB: 6.9 },
        ],
        { '/rules': 7.9, '/spend': 6.9 },
      ),
    ).toEqual({ over: [], outOfStep: [] });
  });

  it('fails a route over its budget, by any amount', () => {
    expect(checkRouteBudgets([{ path: '/rules', ownKiB: 7.94 }], { '/rules': 7.9 })).toEqual({
      over: ['/rules: its own 7.94 KiB, budget 7.9'],
      outOfStep: [],
    });
  });

  it('fails a lazy route without a line, apart from the sizes', () => {
    expect(checkRouteBudgets([{ path: '/new', ownKiB: 1 }], {})).toEqual({
      over: [],
      outOfStep: ['/new: no line'],
    });
  });

  it('needs no line for a route in the first download, and refuses one', () => {
    expect(checkRouteBudgets([{ path: '/yes', ownKiB: undefined }], {})).toEqual({ over: [], outOfStep: [] });
    expect(checkRouteBudgets([{ path: '/yes', ownKiB: undefined }], { '/yes': 0.2 })).toEqual({
      over: [],
      outOfStep: ['/yes: a line, but no lazy route of the router'],
    });
  });

  it('fails a line whose route the router no longer has', () => {
    expect(checkRouteBudgets([{ path: '/receipt', ownKiB: 2 }], { '/receipt': 3, '/receipts': 3 })).toEqual({
      over: [],
      outOfStep: ['/receipts: a line, but no lazy route of the router'],
    });
  });
});
