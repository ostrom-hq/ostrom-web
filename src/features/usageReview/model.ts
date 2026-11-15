// SPDX-License-Identifier: Apache-2.0
import type { ReconcileUsageData } from '@gen/api/types.gen';
import { z } from 'zod/mini';

/** `?member=` keeps one member's (`OrgMember.id`), `?view=history` shows the corrections instead of the pending. */
export const usageReviewSearchSchema = z.object({
  member: z.catch(z.optional(z.string().check(z.trim(), z.minLength(1), z.maxLength(128))), undefined),
  view: z.catch(z.optional(z.enum(['history'])), undefined),
});

const MICROS = 1_000_000;
/** The largest verified total the server takes: $100 000 000. */
export const MAX_RECONCILED_MICROS = 100_000_000_000_000;
/** A reference or a reason is one line of 1 to 240 characters, as the server checks it. */
export const MAX_EVIDENCE_LENGTH = 240;

/** The evidence a correction rests on: the provider's usage record, or its confirmation, for that exact request. */
export const EVIDENCE_SOURCES = ['PROVIDER_RECORD', 'PROVIDER_CONFIRMATION'] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export function isEvidenceSource(value: string): value is EvidenceSource {
  return EVIDENCE_SOURCES.some((source) => source === value);
}

/** A charge in USD, for the reader. */
export function usdOfMicros(micros: number): number {
  return micros / MICROS;
}

/** The verified total typed in USD (0 included), as millionths; undefined when it is not one. */
export function reconciledMicrosOf(draft: string): number | undefined {
  const text = draft.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return undefined;
  const micros = Math.round(Number(text) * MICROS);
  return micros <= MAX_RECONCILED_MICROS ? micros : undefined;
}

/** One line, trimmed, 1 to 240 characters; undefined otherwise. */
export function oneLineOf(draft: string): string | undefined {
  const text = draft.trim();
  if (text === '' || text.length > MAX_EVIDENCE_LENGTH || /[\r\n]/.test(text)) return undefined;
  return text;
}

export type Reconciliation = ReconcileUsageData['body'];

/**
 * The correction to send, or undefined while the form does not describe one. `expectedMicros` and
 * `expectedProviderRequestId` are the charge and the request id the reviewer was shown: the server refuses (409
 * `stale_reconciliation`) when the hold changed since.
 */
export function draftReconciliation(draft: {
  readonly expectedMicros: number;
  readonly expectedProviderRequestId: string | undefined;
  readonly amount: string;
  readonly source: string;
  readonly reference: string;
  readonly reason: string;
}): Reconciliation | undefined {
  const micros = reconciledMicrosOf(draft.amount);
  const reference = oneLineOf(draft.reference);
  const reason = oneLineOf(draft.reason);
  if (micros === undefined || reference === undefined || reason === undefined) return undefined;
  if (!isEvidenceSource(draft.source)) return undefined;
  return {
    expectedMicros: draft.expectedMicros,
    ...(draft.expectedProviderRequestId === undefined
      ? {}
      : { expectedProviderRequestId: draft.expectedProviderRequestId }),
    micros,
    source: draft.source,
    reference,
    reason,
  };
}

/** A charge as the reader's locale writes dollars, to the micro-dollar when it has them: a hold is rarely whole cents. */
export function formatMicros(micros: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(usdOfMicros(micros));
}
