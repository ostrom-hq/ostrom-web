// SPDX-License-Identifier: Apache-2.0
import type { Budget } from '@gen/api/types.gen';
import {
  budgetLevel,
  budgetScopeOf,
  budgetSubjectLabel,
  draftBudget,
  isBudgetScope,
  shares,
  sortBudgets,
} from './model';

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
    expect(shares([line(50), line(100), line(25)]).map((scaled) => scaled.share)).toEqual([0.5, 1, 0.25]);
    expect(shares([line(0)])).toEqual([{ line: line(0), share: 0 }]);
    expect(shares([])).toEqual([]);
  });
});

describe('budgetScopeOf', () => {
  it('reads the server’s organization as the organization’s own, a known scope as is, and nothing else', () => {
    expect([
      budgetScopeOf('organization'),
      budgetScopeOf('org'),
      budgetScopeOf('member'),
      budgetScopeOf('team'),
    ]).toEqual(['org', 'org', 'member', undefined]);
  });

  it('puts the server’s organization budget first', () => {
    const sorted = sortBudgets([
      { scope: 'member', subject: 'ana', hardStop: true },
      { scope: 'organization', hardStop: true },
    ]);
    expect(sorted.map((budget) => budget.scope)).toEqual(['organization', 'member']);
  });
});

describe('isBudgetScope', () => {
  it('knows the organization and members, not a workflow: the server has no workflow budget', () => {
    expect([
      isBudgetScope('org'),
      isBudgetScope('member'),
      isBudgetScope('workflow'),
      isBudgetScope('team'),
    ]).toEqual([true, true, false, false]);
  });
});

describe('sortBudgets', () => {
  it('puts the organization first, then members by subject, then what it does not know', () => {
    const sorted = sortBudgets([
      { scope: 'workflow', subject: 'wf', hardStop: false },
      { scope: 'team', subject: 't', hardStop: false },
      { scope: 'member', subject: 'theo', hardStop: false },
      { scope: 'member', subject: 'ana', hardStop: false },
      { scope: 'org', hardStop: false },
      { scope: 'member', hardStop: false },
    ]);
    expect(sorted.map((budget) => `${budget.scope}:${budget.subject ?? ''}`)).toEqual([
      'org:',
      'member:',
      'member:ana',
      'member:theo',
      'team:t',
      'workflow:wf',
    ]);
  });

  it('puts a budget without a subject before named ones of its scope, whichever comes first', () => {
    const bare: Budget = { scope: 'member', hardStop: false };
    const named: Budget = { scope: 'member', subject: 'ana', hardStop: false };
    expect(sortBudgets([bare, named])).toEqual([bare, named]);
    expect(sortBudgets([named, bare])).toEqual([bare, named]);
  });
});

describe('budgetSubjectLabel', () => {
  const members = [
    { id: 'm-1', login: 'ana', name: 'Ana', avatarUrl: '', email: null, role: 'member', joinedAt: '' },
  ];
  it('names a member by login, an unknown id as is, and nobody for every member', () => {
    expect(budgetSubjectLabel('m-1', members)).toBe('ana');
    expect(budgetSubjectLabel('m-2', members)).toBe('m-2');
    expect(budgetSubjectLabel('m-1', undefined)).toBe('m-1');
    expect(budgetSubjectLabel(undefined, members)).toBeUndefined();
  });
});

describe('draftBudget', () => {
  const draft = { scope: 'org' as const, subject: ' x ', month: '', day: '', hardStop: false };
  it('needs an amount and readable amounts; a member budget without a subject is every member’s', () => {
    expect(draftBudget(draft)).toBeUndefined();
    expect(draftBudget({ ...draft, month: '10' })).toEqual({
      scope: 'org',
      hardStop: false,
      usdPerMonth: 10,
    });
    expect(draftBudget({ ...draft, scope: 'member', subject: '', day: '2' })).toEqual({
      scope: 'member',
      usdPerDay: 2,
      hardStop: false,
    });
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
