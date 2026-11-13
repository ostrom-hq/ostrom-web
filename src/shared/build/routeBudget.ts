// SPDX-License-Identifier: Apache-2.0
// No import: scripts/bundle-budget.ts runs this file under Node, without the app's `@` alias.

/** A route of the router, measured: its own chunks, or none when its screen is in the first download on purpose. */
export interface MeasuredRoute {
  readonly path: string;
  /** KiB gzipped of what the route loads beyond the first download; `undefined` when its screen is in it. */
  readonly ownKiB: number | undefined;
}

/** What keeps the routes from passing: sizes over their budget, and budget lines out of step with the router. */
export interface RouteBudgetCheck {
  readonly over: readonly string[];
  readonly outOfStep: readonly string[];
}

/**
 * Checks each route's own chunks against its line of `budgets` (bundle-budget.json, `routes`). A lazy route without a
 * line fails, so a new screen gets its own budget; a line without its lazy route fails, so a removed or renamed one
 * leaves none, and so does a line for a route in the first download, which has nothing of its own to budget.
 */
export function checkRouteBudgets(
  routes: readonly MeasuredRoute[],
  budgets: Readonly<Record<string, number>>,
): RouteBudgetCheck {
  const over: string[] = [];
  const outOfStep: string[] = [];
  const lazy = new Set<string>();
  for (const route of routes) {
    if (route.ownKiB === undefined) continue;
    lazy.add(route.path);
    const budget = budgets[route.path];
    if (budget === undefined) {
      outOfStep.push(`${route.path}: no line`);
    } else if (route.ownKiB > budget) {
      over.push(`${route.path}: its own ${route.ownKiB.toFixed(2)} KiB, budget ${String(budget)}`);
    }
  }
  for (const path of Object.keys(budgets)) {
    if (!lazy.has(path)) outOfStep.push(`${path}: a line, but no lazy route of the router`);
  }
  return { over, outOfStep };
}
