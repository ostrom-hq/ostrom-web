// SPDX-License-Identifier: Apache-2.0
import { zReceipt } from '@gen/api/zod.gen';
import type * as z from 'zod/mini';

export type ReadReceipt = z.output<typeof zReceipt>;

/** The receipt an answer carries: the document types it as free JSON, so it is read here, never cast. */
export function readReceipt(value: unknown): ReadReceipt | undefined {
  const parsed = zReceipt.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
