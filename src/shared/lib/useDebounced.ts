// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from 'react';

/** `value` once it has stood still for `delayMs`: a search sent when the typing pauses, not at every letter. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}
