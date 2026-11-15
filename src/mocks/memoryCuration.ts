// SPDX-License-Identifier: Apache-2.0
import { handleGetMemoryCuration, handleSetMemoryCuration } from '@gen/api/msw.gen';
import type { MemoryCuration } from '@gen/api/types.gen';
import { zSetMemoryCurationRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface MemoryCurationState {
  memoryCuration: MemoryCuration;
}

/**
 * `GET` and `PUT /memory/curation`, as ostrom-server serves them: an administrator reads and turns it on or off (a
 * member, 403), off by default. The demo never runs the curation: `lastRun*` stay as a test sets them.
 */
export function createMemoryCurationHandlers(
  state: () => MemoryCurationState,
  manages: (request: Request) => boolean,
): HttpHandler[] {
  const forbidden = () => refusal(403, 'forbidden', 'Only owners and admins read or change the curation.');
  return [
    handleGetMemoryCuration(({ request }) =>
      manages(request) ? HttpResponse.json(state().memoryCuration) : forbidden(),
    ),
    handleSetMemoryCuration(async ({ request }) => {
      if (!manages(request)) return forbidden();
      const body = zSetMemoryCurationRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'enabled is true or false');
      state().memoryCuration = { ...state().memoryCuration, enabled: body.data.enabled };
      return HttpResponse.json(state().memoryCuration);
    }),
  ];
}
