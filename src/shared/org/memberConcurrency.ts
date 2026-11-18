// SPDX-License-Identifier: Apache-2.0
import type { InferenceSettingsDto } from '@gen/api/types.gen';

/** The most concurrent requests a member may be given (the contract's `maximum`). */
export const MAX_MEMBER_CONCURRENCY = 32;

/** A member's concurrent requests in the inference settings: 0, the default, for unlimited (TeamCode's member policy). */
export function concurrencyOf(settings: InferenceSettingsDto, memberId: string): number {
  return settings.memberConcurrency?.[memberId] ?? 0;
}

/** The settings with a member's concurrent requests changed, every other setting kept; 0 drops the member's entry. */
export function withConcurrency(
  settings: InferenceSettingsDto,
  memberId: string,
  limit: number,
): InferenceSettingsDto {
  const others = Object.entries(settings.memberConcurrency ?? {}).filter(([id]) => id !== memberId);
  return {
    ...settings,
    memberConcurrency: Object.fromEntries(limit === 0 ? others : [...others, [memberId, limit]]),
  };
}

/** What a draft of the concurrency field says: a whole number from 0 to the maximum, or undefined. */
export function concurrencyDraft(draft: string): number | undefined {
  const limit = /^\d{1,2}$/.test(draft.trim()) ? Number(draft.trim()) : MAX_MEMBER_CONCURRENCY + 1;
  return limit <= MAX_MEMBER_CONCURRENCY ? limit : undefined;
}
