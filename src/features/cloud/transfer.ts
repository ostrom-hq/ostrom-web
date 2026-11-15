// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse, CloudTransferResponse } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import type { BadgeTone } from '@/shared/ui/Badge';

/** The states of a transfer the console has words for (`runners.cloud.transfer.v1`); another one shows as the server wrote it. */
export const TRANSFER_STATES = [
  'offered',
  'accepted',
  'completed',
  'declined',
  'cancelled',
  'expired',
  'failed',
] as const;
export type TransferState = (typeof TRANSFER_STATES)[number];

export function isTransferState(value: string): value is TransferState {
  return TRANSFER_STATES.some((state) => state === value);
}

/** A transfer that may still change the owner: offered and waiting for the recipient, or accepted and moving. */
export function isOpenTransfer(transfer: CloudTransferResponse): boolean {
  return transfer.state === 'offered' || transfer.state === 'accepted';
}

/** Amber while it is open, green once the owner changed, red when it failed. */
export function transferTone(state: string): BadgeTone {
  if (state === 'offered' || state === 'accepted') return 'warning';
  if (state === 'completed') return 'success';
  if (state === 'failed') return 'danger';
  return 'neutral';
}

/**
 * Who may give a session away: its owner, or an owner or an admin of the organization, while it runs or is paused (the
 * server refuses a session being prepared, being transferred or over).
 */
export function mayTransfer(
  session: CloudSessionResponse,
  viewer: string | undefined,
  canManage: boolean,
): boolean {
  return (
    (session.status === 'running' || session.status === 'paused') && (canManage || session.owner === viewer)
  );
}

/** The refusals of a transfer that have their own words. */
export const TRANSFER_REFUSALS = [
  'transfer_disabled',
  'transfer_forbidden',
  'transfer_pending',
  'session_preparing',
  'session_not_running',
  'session_transferring',
  'transfer_expired',
  'transfer_not_open',
  'transfer_in_progress',
  'recipient_ineligible',
] as const;
export type TransferRefusal = (typeof TRANSFER_REFUSALS)[number];

export function transferRefusalOf(failure: Error): TransferRefusal | undefined {
  const code = isApiFailure(failure) ? failure.code : undefined;
  return TRANSFER_REFUSALS.find((known) => known === code);
}

/** A member by login when it is known, else by the start of their id. */
export function memberLabel(id: string, logins: ReadonlyMap<string, string>): string {
  return logins.get(id) ?? id.slice(0, 8);
}
