// SPDX-License-Identifier: AGPL-3.0-only

/** What the console does once it knows who is signed in and their organizations. */
export type OrgStep =
  | { readonly kind: 'keep' }
  | { readonly kind: 'forget'; readonly reason?: 'unknown' }
  | { readonly kind: 'only'; readonly id: string }
  | { readonly kind: 'ask' };

export interface OrgFacts {
  readonly current: string | undefined;
  readonly owner: string | undefined;
  readonly login: string;
  readonly organizations: readonly { readonly id: string }[];
}

/**
 * A choice made by another account is dropped, so is one that is no longer the person's; with none, the only
 * organization is taken and several are asked about. An empty list changes nothing.
 */
export function nextStep({ current, owner, login, organizations }: OrgFacts): OrgStep {
  if (current !== undefined && owner !== undefined && owner !== login) return { kind: 'forget' };
  const [first, ...others] = organizations;
  // An empty list says nothing about a choice: it is kept for when the list is back.
  if (first === undefined) return { kind: 'keep' };
  if (current !== undefined) {
    return organizations.some((organization) => organization.id === current)
      ? { kind: 'keep' }
      : { kind: 'forget', reason: 'unknown' };
  }
  return others.length === 0 ? { kind: 'only', id: first.id } : { kind: 'ask' };
}
