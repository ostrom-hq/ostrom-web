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
 * organization is taken and several are asked about.
 */
export function nextStep({ current, owner, login, organizations }: OrgFacts): OrgStep {
  if (current !== undefined) {
    if (owner !== undefined && owner !== login) return { kind: 'forget' };
    return organizations.some((organization) => organization.id === current)
      ? { kind: 'keep' }
      : { kind: 'forget', reason: 'unknown' };
  }
  const [first, ...others] = organizations;
  if (first === undefined) return { kind: 'keep' };
  return others.length === 0 ? { kind: 'only', id: first.id } : { kind: 'ask' };
}
