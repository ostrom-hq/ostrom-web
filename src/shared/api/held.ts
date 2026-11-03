// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmationPending } from '@gen/api/types.gen';
import { zGovernanceConfirmationPending } from '@gen/api/zod.gen';

function isHeld(data: unknown): data is GovernanceConfirmationPending {
  return zGovernanceConfirmationPending.safeParse(data).success;
}

/**
 * The governance confirmation a write was held for (202), rather than applied. The server holds a governance write
 * made with an API token; one made from the console applies at once, so this is only ever a surprise to say.
 */
export function heldOf(data: unknown): GovernanceConfirmationPending | undefined {
  return isHeld(data) ? data : undefined;
}

/** What a write returned once applied: nothing while it waits for a confirmation. */
export function appliedOf<T>(data: T | GovernanceConfirmationPending | undefined): T | undefined {
  return data === undefined || isHeld(data) ? undefined : data;
}

/** A write of a screen: the confirmation the server held it for, if it did, and when it was sent (0 before). */
export interface HeldWrite {
  readonly held: GovernanceConfirmationPending | undefined;
  readonly sentAt: number;
}

/** The last write's confirmation: once another write is sent, an older one held is no longer the news. */
export function latestHeld(writes: readonly HeldWrite[]): GovernanceConfirmationPending | undefined {
  let latest: HeldWrite | undefined;
  for (const write of writes) if (latest === undefined || write.sentAt > latest.sentAt) latest = write;
  return latest?.held;
}
