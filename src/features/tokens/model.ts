// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What a personal token may be given, by resource. The contract has no scope catalogue yet (the server takes any
 * `resource:action` but `gates:answer`, `agent:session` and `user:*`): this list follows the scopes ostrom-server
 * checks today. No token ever answers a request: a yes is a person's, from the console or the app.
 */
export const TOKEN_RESOURCES = [
  { resource: 'profile', actions: ['read'] },
  { resource: 'orgs', actions: ['read', 'write'] },
  { resource: 'workflows', actions: ['read', 'write'] },
  { resource: 'sessions', actions: ['read', 'write'] },
  { resource: 'receipts', actions: ['read'] },
  { resource: 'artifacts', actions: ['read', 'write'] },
  { resource: 'secrets', actions: ['read', 'write'] },
  { resource: 'cloud', actions: ['read', 'write'] },
  { resource: 'automations', actions: ['read', 'write'] },
  { resource: 'budgets', actions: ['read', 'write'] },
  { resource: 'usage', actions: ['read'] },
  { resource: 'billing', actions: ['read'] },
] as const satisfies readonly {
  readonly resource: string;
  readonly actions: readonly ('read' | 'write')[];
}[];

export type TokenResource = (typeof TOKEN_RESOURCES)[number]['resource'];

/** The lifetimes offered, in days; `null` is a token that never expires. 30 days is the default. */
export const TOKEN_LIFETIMES = [7, 30, 90, 366, null] as const;
export type TokenLifetime = (typeof TOKEN_LIFETIMES)[number];
export const DEFAULT_LIFETIME: TokenLifetime = 30;

/** The lifetime a select's value stands for: anything else reads as the default. */
export function lifetimeOf(value: string): TokenLifetime {
  // Not `find(…) ?? default`: the lifetime found may be `null`, a token that never expires.
  for (const days of TOKEN_LIFETIMES) if (String(days) === value) return days;
  return DEFAULT_LIFETIME;
}

export const TOKEN_NAME_MAX = 100;

/** What the form would send, or why it cannot yet: a name of 1 to 100 characters and at least one scope. */
export function tokenDraftProblem(name: string, scopes: readonly string[]): 'name' | 'scopes' | undefined {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > TOKEN_NAME_MAX) return 'name';
  return scopes.length === 0 ? 'scopes' : undefined;
}

/** Adds or takes away a scope, the list kept in the catalogue's order. */
export function toggleScope(scopes: readonly string[], scope: string, on: boolean): string[] {
  const next = new Set(scopes);
  if (on) next.add(scope);
  else next.delete(scope);
  const order = TOKEN_RESOURCES.flatMap(({ resource, actions }) =>
    actions.map((action) => `${resource}:${action}`),
  );
  return [...next].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
