// SPDX-License-Identifier: AGPL-3.0-only
import type { CheckAttestation, ReceiptNode } from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';

/**
 * Where a check of a receipt ran, or nothing for a step that is not a check. A check signed before receipts said
 * where it ran is the workstation's word: it reads as declared, never as proven.
 */
export function attestationOf(node: ReceiptNode): CheckAttestation | undefined {
  if (node.kind !== 'check') return undefined;
  return node.attestation ?? 'workstation_declared';
}

/** A declaration warns: only a run Ostrom or the CI did itself is shown as proven. */
export function attestationTone(attestation: CheckAttestation): BadgeTone {
  return attestation === 'workstation_declared' ? 'warning' : 'success';
}
