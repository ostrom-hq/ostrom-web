// SPDX-License-Identifier: Apache-2.0
import { isApiFailure } from '@/shared/api/ApiFailure';
import { idempotencyKey } from '@/shared/api/idempotencyKey';

/** The key of a press whose answer is unknown, with what it started: other inputs are another press. */
export interface PendingStart {
  readonly key: string;
  readonly what: string;
}

/** The refusals the server gives a start: it created no run under the key. */
const REFUSALS: ReadonlySet<number> = new Set([400, 401, 403, 404, 409, 422]);

/**
 * Whether the server answered a start with a refusal: no run was started under the key, so the next press is a new
 * one. A lost answer, a timeout (408), a rate limit or a server error says nothing, so the key stays: pressing Start
 * again returns the run the first press may have started, never a second.
 */
export function startRefused(error: unknown): boolean {
  return isApiFailure(error) && error.status !== undefined && REFUSALS.has(error.status);
}

/** The values of a start in a form that does not depend on the order the inputs were written in. */
function whatOf(workflowId: string, inputs: Readonly<Record<string, string>>): string {
  return JSON.stringify([workflowId, Object.entries(inputs).toSorted(([a], [b]) => a.localeCompare(b))]);
}

/** The press a start belongs to: the pending one when it started the same thing, else a new one with a new key. */
export function pressOf(
  pending: PendingStart | undefined,
  workflowId: string,
  inputs: Readonly<Record<string, string>>,
): PendingStart {
  const what = whatOf(workflowId, inputs);
  return pending?.what === what ? pending : { key: idempotencyKey(), what };
}
