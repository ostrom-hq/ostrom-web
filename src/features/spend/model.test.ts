// SPDX-License-Identifier: AGPL-3.0-only
import { budgetLevel, draftBudget, isBudgetScope, shares, sortBudgets } from './model';

describe('budgetLevel', () => {
  it('is calm below 80 %, near from 80 %, over once spent', () => {
    expect([
      budgetLevel(79, 100),
      budgetLevel(80, 100),
      budgetLevel(100, 100),
      budgetLevel(130, 100),
    ]).toEqual(['calm', 'near', 'over', 'over']);
  });
});

describe('shares', () => {
  it('scales each line on the largest, and an all-zero list to zero', () => {
    const line = (usd: number) => ({ key: String(usd), label: '', usd, sessions: 1 });
    expect(shares([line(50), line(100), line(25)])).toEqual([0.5, 1, 0.25]);
    expect(shares([line(0)])).toEqual([0]);
    expect(shares([])).toEqual([]);
  });
});

describe('isBudgetScope', () => {
  it('knows the organization, a member and a workflow', () => {
    expect([
      isBudgetScope('org'),
      isBudgetScope('member'),
      isBudgetScope('workflow'),
      isBudgetScope('team'),
    ]).toEqual([true, true, true, false]);
  });
});

describe('sortBudgets', () => {
  it('puts the organization first, then members and workflows by subject, then what it does not know', () => {
    const sorted = sortBudgets([
      { scope: 'workflow', subject: 'wf', hardStop: false },
      { scope: 'team', subject: 't', hardStop: false },
      { scope: 'member', subject: 'theo', hardStop: false },
      { scope: 'member', subject: 'ana', hardStop: false },
      { scope: 'org', hardStop: false },
    ]);
    expect(sorted.map((budget) => `${budget.scope}:${budget.subject ?? ''}`)).toEqual([
      'org:',
      'member:ana',
      'member:theo',
      'workflow:wf',
      'team:t',
    ]);
  });
});

describe('draftBudget', () => {
  const draft = { scope: 'org' as const, subject: ' x ', month: '', day: '', hardStop: false };
  it('needs an amount, a subject outside the organization, and readable amounts', () => {
    expect(draftBudget(draft)).toBeUndefined();
    expect(draftBudget({ ...draft, month: '10' })).toEqual({
      scope: 'org',
      hardStop: false,
      usdPerMonth: 10,
    });
    expect(draftBudget({ ...draft, scope: 'member', subject: '', day: '2' })).toBeUndefined();
    expect(draftBudget({ ...draft, scope: 'member', day: '2', hardStop: true })).toEqual({
      scope: 'member',
      subject: 'x',
      usdPerDay: 2,
      hardStop: true,
    });
    expect(draftBudget({ ...draft, month: '10', day: 'x' })).toBeUndefined();
    expect(draftBudget({ ...draft, month: 'x', day: '1' })).toBeUndefined();
  });
});
