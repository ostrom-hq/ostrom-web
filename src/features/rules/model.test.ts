// SPDX-License-Identifier: AGPL-3.0-only
import type { Rule } from '@gen/api/types.gen';
import { countRules, groupRules, isAccepted, matches, percent, sureProposals } from './model';

const rule = (id: string, status: Rule['status'], group: string, confidence: number): Rule => ({
  id,
  statement: id,
  output: 'note',
  group,
  strength: 'recommended',
  confidence,
  status,
  foundBy: 'deep-pass',
  foundAt: '2026-10-30T00:00:00.000Z',
});

const rules = [
  rule('a', 'proposed', 'Tests', 0.95),
  rule('b', 'proposed', 'Tests', 0.5),
  rule('c', 'accepted', 'Reviews', 0.9),
  rule('d', 'edited', 'Reviews', 0.99),
  rule('e', 'rejected', 'Style', 0.2),
];

describe('filters and counts', () => {
  it('reads an edited rule as accepted', () => {
    expect(rules.map(isAccepted)).toEqual([false, false, true, true, false]);
  });

  it('counts what is left to decide and what was decided', () => {
    expect(countRules(rules)).toEqual({ todo: 2, accepted: 2, rejected: 1, all: 5 });
    expect(rules.filter((item) => matches(item, 'all'))).toHaveLength(5);
  });
});

describe('groupRules', () => {
  it('orders groups by name and rules by confidence', () => {
    expect(groupRules(rules).map((group) => [group.name, group.rules.map((item) => item.id)])).toEqual([
      ['Reviews', ['d', 'c']],
      ['Style', ['e']],
      ['Tests', ['a', 'b']],
    ]);
  });
});

describe('sure proposals and percent', () => {
  it('keeps proposed rules at 90 % or more', () => {
    expect(sureProposals(rules).map((item) => item.id)).toEqual(['a']);
    expect(percent(0.956)).toBe('96 %');
  });
});
