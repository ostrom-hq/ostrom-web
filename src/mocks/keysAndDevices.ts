// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleCreateServiceKey,
  handleDeleteDevice,
  handleDeleteServiceKey,
  handleListDevices,
  handleListServiceKeys,
} from '@gen/api/msw.gen';
import type { ApiError, Device, ServiceKey } from '@gen/api/types.gen';
import { zCreateServiceKeyBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface KeysAndDevicesState {
  /** Where the CLI is signed in as the person, newest first. */
  devices: Device[];
  /** The organization's live service keys, newest first; never their secret. */
  serviceKeys: ServiceKey[];
  /** The next key number; numbers are never reused, even after a deletion. */
  nextServiceKey: number;
}

/** What a key may carry, as the server checks it: what a CI calls, nothing else. */
const SERVICE_KEY_SCOPES = new Set(['sessions:write', 'rules:read']);

/** A secret the demo can show once: never one the real server would take. */
function secretOf(number: number): string {
  return `osk_demo${String(number).padStart(4, '0')}mockmockmockmockmock`;
}

export interface KeysAndDevicesAccess {
  /** The person is an owner or an admin of the organization the call acts in. */
  readonly manages: (request: Request) => boolean;
  /** The sign-in is older than five minutes: creating a key asks for a fresh one. */
  readonly stale: () => boolean;
}

/**
 * The organization's service keys (owners and admins, a fresh sign-in to create one, the secret in the creating answer
 * only) and the person's workstations, the CLI's tokens, as `KeysAndDevicesApi` of ostrom-server serves them.
 */
export function createKeysAndDevicesHandlers(
  state: () => KeysAndDevicesState,
  now: () => Date,
  access: KeysAndDevicesAccess,
): HttpHandler[] {
  const managersOnly = (): HttpResponse<ApiError> =>
    refusal(403, 'forbidden', 'Only an owner or an admin of the organization manages its service keys.');
  return [
    handleListDevices(() => HttpResponse.json({ items: state().devices })),
    handleDeleteDevice(({ params }) => {
      const s = state();
      if (!s.devices.some((device) => device.id === params.id))
        return refusal(404, 'not_found', 'device not found');
      s.devices = s.devices.filter((device) => device.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    handleListServiceKeys(({ request }) =>
      access.manages(request) ? HttpResponse.json({ items: state().serviceKeys }) : managersOnly(),
    ),
    handleCreateServiceKey(async ({ request }) => {
      if (!access.manages(request)) return managersOnly();
      if (access.stale())
        return refusal(
          403,
          'step_up_required',
          'Creating a service key needs a sign-in less than five minutes old.',
        );
      const body = zCreateServiceKeyBody.safeParse(await readJson(request));
      const name = body.success ? body.data.name.trim() : '';
      const scopes = body.success ? [...new Set(body.data.scopes)].sort() : [];
      if (
        name === '' ||
        name.length > 100 ||
        scopes.length === 0 ||
        scopes.some((scope) => !SERVICE_KEY_SCOPES.has(scope))
      )
        return refusal(400, 'invalid_request', 'A name and sessions:write, rules:read or both are needed.');
      const s = state();
      const number = s.nextServiceKey;
      s.nextServiceKey += 1;
      const key: ServiceKey = { id: `key-${String(number)}`, name, scopes, createdAt: now().toISOString() };
      s.serviceKeys = [key, ...s.serviceKeys];
      return HttpResponse.json({ ...key, secret: secretOf(number) }, { status: 201 });
    }),
    handleDeleteServiceKey(({ request, params }) => {
      if (!access.manages(request)) return managersOnly();
      const s = state();
      if (!s.serviceKeys.some((key) => key.id === params.id))
        return refusal(404, 'not_found', 'service key not found');
      s.serviceKeys = s.serviceKeys.filter((key) => key.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
