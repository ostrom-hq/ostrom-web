// SPDX-License-Identifier: Apache-2.0
import type { EnvironmentVariant, Member } from '@gen/api/types.gen';
import {
  bindingOf,
  checkVariant,
  isNonEmpty,
  memberLabel,
  memberRows,
  personalOf,
  sortVariants,
  valueState,
} from './model';

const variant = (overrides: Partial<EnvironmentVariant>): EnvironmentVariant => ({
  id: 'v',
  variable: 'A',
  name: 'n',
  binding: 'shared',
  hasValue: true,
  version: 1,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const member = (id: string, login: string, overrides: Partial<Member> = {}): Member => ({
  id,
  login,
  avatarUrl: '',
  role: 'member',
  ...overrides,
});

describe('a variant draft', () => {
  const draft = { variable: ' GITHUB_TOKEN ', name: ' acme ', binding: 'shared', value: 'v' } as const;

  it('sends a shared variant with its value, trimmed', () => {
    expect(checkVariant(draft)).toEqual({
      body: { variable: 'GITHUB_TOKEN', name: 'acme', binding: 'shared', value: 'v' },
    });
  });

  it('drops the value of a per-member variant', () => {
    expect(checkVariant({ ...draft, binding: 'perMember' })).toEqual({
      body: { variable: 'GITHUB_TOKEN', name: 'acme', binding: 'perMember' },
    });
  });

  it('says what stops it, in the order the form reads', () => {
    expect(checkVariant({ ...draft, variable: 'lower' })).toEqual({ problem: 'variable' });
    expect(checkVariant({ ...draft, variable: `A${'B'.repeat(128)}` })).toEqual({ problem: 'variable' });
    expect(checkVariant({ ...draft, variable: '_OK' })).toHaveProperty('body');
    expect(checkVariant({ ...draft, name: ' ' })).toEqual({ problem: 'name' });
    expect(checkVariant({ ...draft, name: 'x'.repeat(121) })).toEqual({ problem: 'name' });
    expect(checkVariant({ ...draft, value: '' })).toEqual({ problem: 'value' });
    expect(checkVariant({ ...draft, value: 'x'.repeat(16_385) })).toEqual({ problem: 'value' });
  });
});

describe('what the page says of a variant', () => {
  it('reads an unknown binding as per member, the one that stores nothing', () => {
    expect(bindingOf('shared')).toBe('shared');
    expect(bindingOf('perMember')).toBe('perMember');
    expect(bindingOf('group')).toBe('perMember');
  });

  it('says whether a value is stored, never what it is', () => {
    expect(valueState(variant({}))).toBe('stored');
    expect(valueState(variant({ hasValue: false }))).toBe('none');
    expect(valueState(variant({ binding: 'perMember' }))).toBe('perMember');
  });

  it('sorts by variable, then name', () => {
    const sorted = sortVariants([
      variant({ id: '3', variable: 'B', name: 'a' }),
      variant({ id: '2', variable: 'A', name: 'z' }),
      variant({ id: '1', variable: 'A', name: 'b' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['1', '2', '3']);
  });
});

describe('the effective assignments by member', () => {
  it('lists every member in the list order, then any other member the assignments name, by id', () => {
    const rows = memberRows(
      [member('m1', 'ana', { name: 'Ana' }), member('m2', 'bo'), member('m3', 'cy', { role: 'invited' })],
      {
        items: [
          {
            member: 'm2',
            variable: 'Z',
            variantId: 'v1',
            variantName: 'z',
            version: 1,
            source: 'direct',
            personal: false,
            hasMemberValue: false,
            assignedAt: '2026-10-01T00:00:00Z',
          },
          {
            member: 'm2',
            variable: 'A',
            variantId: 'v2',
            variantName: 'a',
            version: 1,
            source: 'bulk',
            personal: false,
            hasMemberValue: false,
            assignedAt: '2026-10-01T00:00:00Z',
          },
        ],
        exclusions: [
          { member: 'gone', variable: 'B' },
          { member: 'gone', variable: 'A' },
        ],
      },
    );
    expect(rows.map((row) => row.label)).toEqual(['Ana (ana)', 'bo', 'gone']);
    expect(rows[1]?.assignments.map((item) => item.variable)).toEqual(['A', 'Z']);
    expect(rows[2]?.exclusions.map((item) => item.variable)).toEqual(['A', 'B']);
  });

  it('names members by id without a member list', () => {
    expect(memberRows(undefined, { items: [], exclusions: [{ member: 'm1', variable: 'A' }] })).toEqual([
      { id: 'm1', label: 'm1', assignments: [], exclusions: [{ member: 'm1', variable: 'A' }] },
    ]);
  });

  it('names a member by login when they have no name', () => {
    expect(memberLabel(member('m', 'bo', { name: '' }))).toBe('bo');
    expect(isNonEmpty([])).toBe(false);
    expect(isNonEmpty([1])).toBe(true);
  });
});

describe('the personal variants', () => {
  it('keeps those with an owner', () => {
    const mine = variant({ id: 'p', owner: 'm1' });
    expect(personalOf([mine, variant({ id: 't' })])).toEqual([{ variant: mine, owner: 'm1' }]);
  });
});
