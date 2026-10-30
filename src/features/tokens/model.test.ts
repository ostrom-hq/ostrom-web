// SPDX-License-Identifier: AGPL-3.0-only
import { lifetimeOf, TOKEN_RESOURCES, toggleScope, tokenDraftProblem } from './model';

describe('the token catalogue', () => {
  it('never offers what no token may carry', () => {
    const scopes = TOKEN_RESOURCES.flatMap(({ resource, actions }) => actions.map((a) => `${resource}:${a}`));
    expect(scopes).not.toContain('gates:answer');
    expect(scopes).not.toContain('agent:session');
    expect(scopes.every((scope) => /^[a-z][a-z0-9-]{0,31}:[a-z][a-z0-9-]{0,31}$/.test(scope))).toBe(true);
  });
});

describe('lifetimeOf', () => {
  it('reads the select’s value, the default for anything else', () => {
    expect(lifetimeOf('7')).toBe(7);
    expect(lifetimeOf('366')).toBe(366);
    expect(lifetimeOf('null')).toBeNull();
    expect(lifetimeOf('12')).toBe(30);
  });
});

describe('tokenDraftProblem', () => {
  it('needs a name of 1 to 100 characters, then a scope', () => {
    expect(tokenDraftProblem('  ', ['orgs:read'])).toBe('name');
    expect(tokenDraftProblem('x'.repeat(101), ['orgs:read'])).toBe('name');
    expect(tokenDraftProblem('CI', [])).toBe('scopes');
    expect(tokenDraftProblem(' CI ', ['orgs:read'])).toBeUndefined();
  });
});

describe('toggleScope', () => {
  it('keeps the catalogue’s order and never a scope twice', () => {
    const some = toggleScope(toggleScope([], 'receipts:read', true), 'orgs:read', true);
    expect(some).toEqual(['orgs:read', 'receipts:read']);
    expect(toggleScope(some, 'orgs:read', true)).toEqual(['orgs:read', 'receipts:read']);
    expect(toggleScope(some, 'orgs:read', false)).toEqual(['receipts:read']);
  });
});
