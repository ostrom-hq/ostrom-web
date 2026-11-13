// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';

/** How many lines a long list shows at first, and how many more each "Show more" adds. */
export const STEP = 100;

export interface Step {
  /** How many lines are on screen. */
  readonly count: number;
  /** Lines not on screen yet. */
  readonly hidden: number;
  /** How many the next "Show more" adds. */
  readonly next: number;
  readonly showMore: () => void;
}

/**
 * The first lines of a long list, more on demand: a screen never builds the DOM of hundreds of lines at once
 * (PERF-CONSOLE). `scope` names what the list shows (a filter, a search): another one starts again from the first.
 */
export function useStep(total: number, scope = '', step: number = STEP): Step {
  const [shown, setShown] = useState({ scope, count: step });
  const count = shown.scope === scope ? shown.count : step;
  const hidden = Math.max(0, total - count);
  return {
    count,
    hidden,
    next: Math.min(step, hidden),
    showMore: () => {
      setShown({ scope, count: count + step });
    },
  };
}
