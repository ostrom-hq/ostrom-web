// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, Secret } from '@gen/api/types.gen';
import {
  addMemberRow,
  allows,
  defaultModelOf,
  defaultRefusedFor,
  keySecrets,
  listOf,
  memberName,
  policyDraftOf,
  policyOf,
  policyProblem,
  providersDraftOf,
  readModelPolicy,
  runsAgents,
  settingsOf,
} from './model';

describe('a model policy', () => {
  it('reads a list as the gateway does: prefixes, and empty for every model', () => {
    expect(listOf(' claude-, gpt-5\nclaude- ')).toEqual(['claude-', 'gpt-5']);
    expect(allows([], 'anything')).toBe(true);
    expect(allows(['claude-'], 'claude-opus-4-1')).toBe(true);
    expect(allows(['claude-'], 'gpt-5')).toBe(false);
  });

  it('turns a policy into a draft and back', () => {
    const draft = policyDraftOf({
      allowed: ['claude-', 'gpt-5'],
      default: 'claude-sonnet-4-5',
      byMember: { m1: ['x'] },
    });
    expect(draft).toEqual({
      allowed: 'claude-, gpt-5',
      defaultModel: 'claude-sonnet-4-5',
      byMember: [{ key: 0, member: 'm1', models: 'x' }],
    });
    expect(policyOf({ ...draft, defaultModel: ' claude-opus ' })).toEqual({
      allowed: ['claude-', 'gpt-5'],
      default: 'claude-opus',
      byMember: { m1: ['x'] },
    });
    expect(policyDraftOf({ allowed: [], default: '' }).byMember).toEqual([]);
    expect(addMemberRow(addMemberRow([]))).toEqual([
      { key: 0, member: '', models: '' },
      { key: 1, member: '', models: '' },
    ]);
  });

  it('says what keeps a policy from being saved, first things first', () => {
    const fine = { allowed: 'claude-', defaultModel: 'claude-sonnet-4-5', byMember: [] };
    expect(policyProblem(fine)).toBeUndefined();
    expect(policyProblem({ ...fine, allowed: 'claude opus;' })).toBe('format');
    expect(policyProblem({ ...fine, defaultModel: 'claude sonnet' })).toBe('format');
    expect(policyProblem({ ...fine, defaultModel: ' ' })).toBe('noDefault');
    expect(policyProblem({ ...fine, defaultModel: 'gpt-5' })).toBe('default');
    const row = { key: 0, member: 'm1', models: 'gpt-5' };
    expect(policyProblem({ ...fine, byMember: [row] })).toBeUndefined();
    expect(policyProblem({ ...fine, byMember: [{ ...row, models: 'gpt 5!' }] })).toBe('format');
    expect(policyProblem({ ...fine, byMember: [{ ...row, member: ' ' }] })).toBe('member');
    expect(policyProblem({ ...fine, byMember: [row, { ...row, key: 1 }] })).toBe('twice');
    expect(policyProblem({ ...fine, byMember: [{ ...row, models: ' , ' }] })).toBe('memberModels');
  });

  it('reads a policy without a default as no default, and refuses what is not a policy', async () => {
    expect(await readModelPolicy({ allowed: ['claude-'] })).toEqual({ allowed: ['claude-'], default: '' });
    expect(await readModelPolicy({ allowed: [], default: null })).toEqual({ allowed: [], default: '' });
    expect(await readModelPolicy({ allowed: [], default: 'x', byMember: { m1: ['y'] } })).toEqual({
      allowed: [],
      default: 'x',
      byMember: { m1: ['y'] },
    });
    await expect(readModelPolicy({ allowed: 'claude-' })).rejects.toThrow();
  });

  it('names the members whose own list refuses the default', () => {
    const draft = { allowed: '', defaultModel: 'claude-sonnet-4-5', byMember: [] };
    const row = { key: 0, member: 'm1', models: 'claude-haiku' };
    expect(defaultRefusedFor({ ...draft, byMember: [row] })).toEqual(['m1']);
    expect(defaultRefusedFor({ ...draft, byMember: [{ ...row, models: 'claude-' }] })).toEqual([]);
    // Not yet a member, not yet a list, no default: nothing to say.
    expect(defaultRefusedFor({ ...draft, byMember: [{ ...row, member: ' ' }] })).toEqual([]);
    expect(defaultRefusedFor({ ...draft, byMember: [{ ...row, models: '' }] })).toEqual([]);
    expect(defaultRefusedFor({ ...draft, defaultModel: '', byMember: [row] })).toEqual([]);
  });

  it('names a member by login when the members are known', () => {
    const members: Member[] = [{ id: 'm1', login: 'lena', avatarUrl: '', role: 'owner' }];
    expect(memberName('m1', members)).toBe('lena');
    expect(memberName('m2', members)).toBe('m2');
    expect(memberName('m1', undefined)).toBe('m1');
    expect(runsAgents(members[0] ?? { id: '', login: '', avatarUrl: '', role: 'invited' })).toBe(true);
    expect(runsAgents({ id: 'm2', login: 'jo', avatarUrl: '', role: 'invited' })).toBe(false);
  });
});

describe('the provider keys', () => {
  it('turns the settings into a draft and back, a key left empty being no key', () => {
    expect(providersDraftOf({})).toEqual({ anthropic: '', openai: '', openrouter: '', shared: true });
    const draft = providersDraftOf({
      anthropicKeySecret: 'A',
      openaiKeySecret: 'O',
      openrouterKeySecret: 'R',
      useSharedAccounts: false,
    });
    expect(draft).toEqual({ anthropic: 'A', openai: 'O', openrouter: 'R', shared: false });
    expect(settingsOf(draft)).toEqual({
      anthropicKeySecret: 'A',
      openaiKeySecret: 'O',
      openrouterKeySecret: 'R',
      useSharedAccounts: false,
    });
    expect(settingsOf({ anthropic: ' ', openai: '', openrouter: '', shared: true })).toEqual({
      useSharedAccounts: true,
    });
  });

  it('offers the organization’s secrets only, sorted', () => {
    const secret = (name: string, owner?: string): Secret => ({
      name,
      scope: 'org',
      createdAt: '',
      updatedAt: '',
      updatedBy: 'maya',
      version: 1,
      ...(owner === undefined ? {} : { owner }),
    });
    expect(keySecrets([secret('Z_KEY'), secret('MINE', 'maya'), secret('A_KEY')])).toEqual([
      'A_KEY',
      'Z_KEY',
    ]);
  });
});

describe('defaultModelOf', () => {
  it('reads the default, or nothing while none is set', () => {
    expect(defaultModelOf({ allowed: ['claude-'], default: 'claude-opus' })).toBe('claude-opus');
    expect(defaultModelOf({ allowed: ['claude-'] })).toBe('');
    expect(policyDraftOf({ allowed: ['claude-'] }).defaultModel).toBe('');
  });
});
