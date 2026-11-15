// SPDX-License-Identifier: Apache-2.0
import { isApiFailure } from '@/shared/api/ApiFailure';
import { idempotencyKey } from '@/shared/api/idempotencyKey';

/** The key of a press of Start whose answer is unknown, with what it asked for: another request is another press. */
export interface PendingCreate {
  readonly key: string;
  readonly what: string;
}

/** The refusals the server gives a create: it created no session under the key (422 includes a key reused). */
const REFUSALS: ReadonlySet<number> = new Set([400, 401, 402, 403, 404, 409, 422]);

/**
 * Whether the server answered a create with a refusal: no session was created under the key, so the next press is a
 * new one. A lost answer, a timeout (408), a rate limit or a server error says nothing, so the key stays: pressing
 * Start again returns the session the first press may have created (`runners.cloud.idempotency.v1`), never a second.
 */
export function createRefused(error: unknown): boolean {
  return isApiFailure(error) && error.status !== undefined && REFUSALS.has(error.status);
}

/**
 * The press a create belongs to: the pending one when it asks for the same session, else a new one with a new key.
 * The body is built in a fixed order (useSessionChange), so its JSON names the request.
 */
export function pressOf(pending: PendingCreate | undefined, body: unknown): PendingCreate {
  const what = JSON.stringify(body);
  return pending?.what === what ? pending : { key: idempotencyKey(), what };
}
