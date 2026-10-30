// SPDX-License-Identifier: AGPL-3.0-only
import { nameProblem, slugOf, slugProblem } from './slug';

describe('the short name of an organization', () => {
  it('is derived as the server derives it', () => {
    expect(slugOf('Acme Corp')).toBe('acme-corp');
    expect(slugOf('  --Wayne  Enterprises!! ')).toBe('wayne-enterprises');
    expect(slugOf('Ça va')).toBe('a-va');
    expect(slugOf(`${'a'.repeat(38)} b`)).toBe('a'.repeat(38));
    expect(slugOf('Été')).toBe('team');
    expect(slugOf('Admin')).toBe('team');
  });

  it('is checked as the server checks a chosen one', () => {
    expect(slugProblem('acme-corp')).toBeUndefined();
    expect(slugProblem('a')).toBe('shape');
    expect(slugProblem('a'.repeat(40))).toBe('shape');
    expect(slugProblem('acme--corp')).toBe('shape');
    expect(slugProblem('-acme')).toBe('shape');
    expect(slugProblem('Acme')).toBe('shape');
    expect(slugProblem('settings')).toBe('reserved');
  });
});

describe('the name of an organization', () => {
  it('is 1 to 100 characters once trimmed, without control characters', () => {
    expect(nameProblem(' Acme ')).toBeUndefined();
    expect(nameProblem('   ')).toBe('empty');
    expect(nameProblem('x'.repeat(101))).toBe('long');
    expect(nameProblem('Ac\u0007me')).toBe('control');
    expect(nameProblem('Ac\u0085me')).toBe('control');
    expect(nameProblem('Ac me')).toBeUndefined();
  });
});
