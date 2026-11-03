// SPDX-License-Identifier: AGPL-3.0-only

/** Red stub: the value at once. */
export function useDebounced<T>(value: T, delayMs: number): T {
  return delayMs < 0 ? value : value;
}
