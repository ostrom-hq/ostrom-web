// SPDX-License-Identifier: Apache-2.0
import { concurrencyDraft, concurrencyOf, withConcurrency } from './memberConcurrency';

describe('a member’s concurrent requests', () => {
  it('is 0, unlimited, unless the settings give one', () => {
    expect(concurrencyOf({}, 'm1')).toBe(0);
    expect(concurrencyOf({ memberConcurrency: { m1: 3 } }, 'm1')).toBe(3);
    expect(concurrencyOf({ memberConcurrency: { m1: 3 } }, 'm2')).toBe(0);
  });

  it('changes one member’s, keeps the rest, and drops a member set to 0', () => {
    expect(withConcurrency({ useSharedAccounts: true }, 'm1', 2)).toEqual({
      useSharedAccounts: true,
      memberConcurrency: { m1: 2 },
    });
    expect(
      withConcurrency({ anthropicKeySecret: 'K', memberConcurrency: { m1: 2, m2: 5 } }, 'm1', 0),
    ).toEqual({
      anthropicKeySecret: 'K',
      memberConcurrency: { m2: 5 },
    });
  });

  it('reads a whole number from 0 to 32 in the field, and nothing else', () => {
    expect(concurrencyDraft('0')).toBe(0);
    expect(concurrencyDraft(' 32 ')).toBe(32);
    for (const draft of ['33', '', '-1', '1.5', 'x', '100']) expect(concurrencyDraft(draft)).toBeUndefined();
  });
});
