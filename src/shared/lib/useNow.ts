// SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react';

const TICK_MS = 15_000;
let now = new Date();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick(): void {
  now = new Date();
  listeners.forEach((listener) => {
    listener();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(tick, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function snapshot(): Date {
  return now;
}

/** The current time, shared by every relative date on screen and refreshed every 15 s (render stays pure). */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, snapshot);
}
