// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmationPending } from '@gen/api/types.gen';

/** Red stub: the write ignores the 202. */
const held = Symbol('held');

function isHeld(data: unknown): data is GovernanceConfirmationPending {
  return typeof data === 'object' && data !== null && 'confirmationId' in data;
}

/**
 * The governance confirmation a write was held for (202), rather than applied. The server holds a governance write
 * made with an API token; one made from the console applies at once, so this is only ever a surprise to say.
 */
export function heldOf(data: unknown): GovernanceConfirmationPending | undefined {
  return data === held ? undefined : undefined;
}

/** What a write returned once applied: nothing while it waits for a confirmation. */
export function appliedOf<T>(data: T | GovernanceConfirmationPending | undefined): T | undefined {
  return data === undefined || isHeld(data) ? undefined : data;
}
