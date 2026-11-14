// SPDX-License-Identifier: Apache-2.0
import type { DeviceAuthorization } from '@gen/api/types.gen';

/** The code of the demo's waiting `ostrom login`: `/device?code=WDJB-MJHT` opens it. */
export const DEMO_DEVICE_CODE = 'WDJB-MJHT';
/** The code of the demo's waiting `ostrom login --admin`, which lists every scope its token gets. */
export const DEMO_ADMIN_DEVICE_CODE = 'KPRT-ZXCV';

/** How long a device login waits for its answer, as on the server. */
const DEVICE_CODE_LIFETIME_MS = 10 * 60_000;

/** A device login as the server keeps it: what the console reads, and whether it was answered. */
export interface MockDeviceLogin {
  readonly authorization: DeviceAuthorization;
  status: 'pending' | 'approved' | 'denied';
  /** The organization an approved admin sign-in's token is bound to, as the server records it. */
  orgId?: string;
}

/** What the token of `ostrom login --admin` holds, as the server lists it before the yes. */
export const ADMIN_TOKEN_SCOPES = [
  'accounts:read',
  'accounts:write',
  'cloud:write',
  'environment:read',
  'gates:policy',
  'gates:read',
  'harness:write',
  'inference:read',
  'mcp:read',
  'orgs:read',
  'policy:write',
  'profile:read',
  'receipts:read',
  'rules:read',
  'sessions:write',
  'skills:read',
  'skills:write',
  'workflows:read',
];

/** Two terminals waiting for their person: an ordinary sign-in, and an admin one. */
export function initialDeviceLogins(): MockDeviceLogin[] {
  const now = Date.now();
  const requestedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + DEVICE_CODE_LIFETIME_MS).toISOString();
  return [
    {
      authorization: {
        userCode: DEMO_DEVICE_CODE,
        clientName: 'ostrom CLI on ada-laptop',
        expiresAt,
        requestedAt,
        requestedFrom: '203.0.113.0/24',
      },
      status: 'pending',
    },
    {
      authorization: {
        userCode: DEMO_ADMIN_DEVICE_CODE,
        clientName: 'ostrom CLI on ops-box',
        // every scope the admin token gets, as the server lists them: the page hides none of them
        scopes: ADMIN_TOKEN_SCOPES,
        expiresAt,
        requestedAt,
        requestedFrom: '2001:db8:abcd::/48',
      },
      status: 'pending',
    },
  ];
}
