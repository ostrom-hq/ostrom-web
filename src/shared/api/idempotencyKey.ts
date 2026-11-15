// SPDX-License-Identifier: Apache-2.0
/** An idempotency key for one gesture, from the random source every context has (randomUUID needs https). */
export function idempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
