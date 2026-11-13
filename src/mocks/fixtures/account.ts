// SPDX-License-Identifier: Apache-2.0
import type { AuthSession, Device, ServiceKey, Token } from '@gen/api/types.gen';

/** Maya's sessions: this browser, her phone and a laptop left signed in. */
export function initialAuthSessions(): AuthSession[] {
  return [
    {
      id: 'ses-browser',
      createdAt: '2026-10-30T08:12:00Z',
      lastSeenAt: '2026-10-30T09:40:00Z',
      device: 'Firefox on macOS',
      current: true,
    },
    {
      id: 'ses-phone',
      createdAt: '2026-10-28T19:03:00Z',
      lastSeenAt: '2026-10-30T07:55:00Z',
      device: 'Ostrom on iPhone',
      current: false,
    },
    { id: 'ses-laptop', createdAt: '2026-10-02T10:20:00Z', current: false },
  ];
}

/** Maya's live tokens, newest first: a CI token that expires, and the CLI's own. */
export function initialTokens(): Token[] {
  return [
    {
      id: 'tok-2',
      name: 'GitHub Actions',
      kind: 'personal',
      scopes: ['receipts:read', 'workflows:read'],
      hint: 'osp_7Hq2',
      createdAt: '2026-10-20T09:00:00Z',
      expiresAt: '2026-11-19T09:00:00Z',
      lastUsedAt: '2026-10-30T06:05:00Z',
    },
    {
      id: 'tok-1',
      name: 'ostrom on maya-mbp',
      kind: 'cli',
      scopes: ['profile:read', 'orgs:read', 'workflows:read', 'sessions:write'],
      hint: 'osc_Pk9d',
      createdAt: '2026-10-01T14:30:00Z',
      expiresAt: null,
      lastUsedAt: null,
    },
  ];
}

/** Where the CLI is signed in as Maya: her laptop, used this morning, and a CI box never seen since. */
export function initialDevices(): Device[] {
  return [
    { id: 'dev-2', name: 'ci-runner-3', kind: 'cli' },
    { id: 'dev-1', name: 'maya-mbp', kind: 'cli', lastSeenAt: '2026-10-30T08:05:00Z' },
  ];
}

/** Acme's service key: GitHub Actions reports its checks and reads the rules. */
export function initialServiceKeys(): ServiceKey[] {
  return [
    {
      id: 'key-1',
      name: 'GitHub Actions',
      scopes: ['rules:read', 'sessions:write'],
      createdAt: '2026-10-25T10:00:00Z',
      lastUsedAt: '2026-10-30T06:10:00Z',
    },
  ];
}
