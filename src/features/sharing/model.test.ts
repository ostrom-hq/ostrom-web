// SPDX-License-Identifier: AGPL-3.0-only
import type { SharedAccount } from '@gen/api/types.gen';
import { accountState, isArtifactAccess, isProvider, providerOf } from './model';

const account: SharedAccount = {
  id: 'acc-1',
  provider: 'anthropic',
  label: 'x',
  owner: 'maya',
  status: 'active',
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

  it('names a subscription by its vendor, from the vendor or the agent the server keeps', () => {
    expect(providerOf('anthropic')).toBe('anthropic');
    expect(providerOf('claude')).toBe('anthropic');
    expect(providerOf('codex')).toBe('openai');
    expect(providerOf('mistral')).toBeUndefined();
  });

  it('reads a pause before the provider status, and a status it does not know as unknown', () => {
    expect(accountState(account)).toBe('active');
    expect(accountState({ ...account, status: 'expired' })).toBe('expired');
    expect(accountState({ ...account, status: 'expired', paused: true })).toBe('paused');
    expect(accountState({ ...account, status: 'revoked' })).toBe('unknown');
  });

  it('reads the server’s statuses', () => {
    expect(accountState({ ...account, status: 'ready' })).toBe('active');
    expect(accountState({ ...account, status: 'reconnect_required' })).toBe('expired');
    expect(accountState({ ...account, status: 'wrong_account' })).toBe('expired');
    expect(accountState({ ...account, status: 'disabled' })).toBe('paused');
  });
});
