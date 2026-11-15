// SPDX-License-Identifier: Apache-2.0
import type { Approval } from '@gen/api/types.gen';

/** Where a request stands for the person looking at it. */
export type ApprovalTone = 'waiting-you' | 'asked-by-you' | 'approved' | 'refused' | 'expired' | 'unknown';

export function askedByViewer(approval: Approval, viewer: string | undefined): boolean {
  if (viewer === undefined) return false;
  const login = viewer.toLowerCase();
  return (approval.askedBy ?? []).some((author) => author.toLowerCase() === login);
}

export function approvalTone(approval: Approval, viewer: string | undefined): ApprovalTone {
  switch (approval.status) {
    case 'pending':
      return askedByViewer(approval, viewer) ? 'asked-by-you' : 'waiting-you';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'refused';
    case 'expired':
      return 'expired';
    default:
      // A status a newer server names: shown as the server wrote it, in a neutral tone.
      return 'unknown';
  }
}

/** A request that can still change: pending, or not loaded yet. A decided one is final, so nobody polls it. */
export function stillOpen(data: unknown): boolean {
  return !(typeof data === 'object' && data !== null && 'status' in data && data.status !== 'pending');
}

/** The actions whose name the Approve button says (`Approve merge`); any other leaves it plain. */
export const APPROVE_ACTIONS = ['push', 'merge', 'deploy', 'tool'] as const;

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
