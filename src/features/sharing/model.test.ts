// SPDX-License-Identifier: AGPL-3.0-only
import type { Artifact, SharedAccount } from '@gen/api/types.gen';
import { accountState, isArtifactAccess, isProvider, ownsArtifact, providerOf } from './model';

const account: SharedAccount = {
  id: 'acc-1',
  provider: 'anthropic',
  label: 'x',
  owner: 'maya',
  status: 'ready',
  sharedWith: [],
  paused: false,
};

describe('sharing model', () => {
  it('knows the accesses and providers it has words for', () => {
    expect(isArtifactAccess('team')).toBe(true);
    expect(isArtifactAccess('members')).toBe(false);
    expect(isArtifactAccess('public')).toBe(false);
    expect(isProvider('openai')).toBe(true);
    expect(isProvider('mistral')).toBe(false);
  });

  it('names a subscription by its vendor, from the agent the server keeps, and nothing else', () => {
    expect(providerOf('claude')).toBe('anthropic');
    expect(providerOf('codex')).toBe('openai');
    expect(providerOf('mistral')).toBeUndefined();
    expect(providerOf('constructor')).toBeUndefined();
  });

  it('reads a pause before the provider status, and a status it does not know as unknown', () => {
    expect(accountState(account)).toBe('active');
    expect(accountState({ ...account, status: 'reconnect_required' })).toBe('expired');
    expect(accountState({ ...account, status: 'reconnect_required', paused: true })).toBe('paused');
    expect(accountState({ ...account, status: 'revoked' })).toBe('unknown');
    expect(accountState({ ...account, status: 'toString' })).toBe('unknown');
  });

  it('reads the server’s statuses', () => {
    expect(accountState({ ...account, status: 'wrong_account' })).toBe('wrongAccount');
    expect(accountState({ ...account, status: 'disabled' })).toBe('paused');
  });
});

describe('ownsArtifact', () => {
  const artifact: Artifact = {
    id: 'a',
    title: 'Plan',
    owner: 'maya',
    access: 'team',
    latestVersion: 1,
    url: '/artifacts/a',
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
  };

  it('trusts the relation the server gives, whatever the names', () => {
    expect(ownsArtifact({ ...artifact, relation: 'owner' }, 'samir')).toBe(true);
    expect(ownsArtifact({ ...artifact, relation: 'team' }, 'maya')).toBe(false);
    expect(ownsArtifact({ ...artifact, relation: 'viewer' }, 'maya')).toBe(false);
  });

  it('reads the owner by name from a server older than the relation', () => {
    expect(ownsArtifact(artifact, 'maya')).toBe(true);
    expect(ownsArtifact(artifact, 'samir')).toBe(false);
    expect(ownsArtifact(artifact, undefined)).toBe(false);
  });
});
