// SPDX-License-Identifier: Apache-2.0
import type { AuthSessionRow } from '@/features/settings/components/SessionRow';
import type { DeviceResponse, ServiceKeyResponse, TokenResponse } from '@gen/api/types.gen';

/** Maya's sessions: this browser, her phone and a laptop left signed in. */
export function initialAuthSessions(): AuthSessionRow[] {
  return [
    {
      id: 'ses-browser',
      name: 'Firefox on macOS',
      createdAt: '2026-10-30T08:12:00Z',
      lastSeenAt: '2026-10-30T09:40:00Z',
      current: true,
    },
    {
      id: 'ses-phone',
      name: 'Ostrom on iPhone',
      createdAt: '2026-10-28T19:03:00Z',
      lastSeenAt: '2026-10-30T07:55:00Z',
      current: false,
    },
    {
      id: 'ses-laptop',
      createdAt: '2026-10-02T10:20:00Z',
      lastSeenAt: '2026-10-02T10:20:00Z',
      current: false,
    },
  ];
}

/** Maya's live tokens, newest first: a CI token that expires, and the CLI's own. */
export function initialTokens(): TokenResponse[] {
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
export function initialDevices(): DeviceResponse[] {
  return [
    { id: 'dev-2', name: 'ci-runner-3', kind: 'cli' },
    { id: 'dev-1', name: 'maya-mbp', kind: 'cli', lastSeenAt: '2026-10-30T08:05:00Z' },
  ];
}

/** Acme's service key: GitHub Actions reports its checks and reads the rules. */
export function initialServiceKeys(): ServiceKeyResponse[] {
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
