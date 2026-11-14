// SPDX-License-Identifier: Apache-2.0
import { useEffect } from 'react';
import { type OrgMembers, useOrgMembers } from './members';
import { useCurrentOrg } from './useCurrentOrg';

export interface CurrentOrgMembers extends OrgMembers {
  /**
   * Nothing more is awaited: the members came back (every page of them with `all`), failed, or cannot be asked for
   * (no organization to ask in).
   */
  readonly settled: boolean;
}

/** What to see of the members: a page of a hundred and the next one when asked, or `all` of them. */
export interface CurrentOrgMembersOptions {
  /**
   * Reads every page, one after the other, without being asked: for a screen that only names people, where a member
   * beyond the first hundred must still be named, never shown as an id or as someone who left.
   */
  readonly all?: boolean;
}

/**
 * The members of the organization the console acts in, read from `GET /orgs/{org}/members` (the route the server
 * serves) once the organization is known, a page of a hundred at a time. Only names and pickers use it: a refusal is
 * not asked again, and the screen opens without them. A next page that fails keeps the pages read: it is
 * `moreFailed`, never the list's `error`, and is not asked again until the person asks.
 */
export function useCurrentOrgMembers({ all = false }: CurrentOrgMembersOptions = {}): CurrentOrgMembers {
  const { org, failure, none, choosing } = useCurrentOrg();
  const people = useOrgMembers(org?.id ?? '', {
    enabled: org !== undefined,
    staleTime: 60_000,
    retry: false,
  });
  const { more, loadingMore, moreFailed } = people;
  const following = all && more !== undefined && !loadingMore && !moreFailed;
  useEffect(() => {
    if (following) more();
  }, [following, more]);
  const read = !people.pending && (!all || people.complete || moreFailed || people.members === undefined);
  return {
    ...people,
    // With `all`, the next pages come by themselves: the person asks for one only when it failed.
    more: all && !moreFailed ? undefined : more,
    // Without an organization the members cannot be asked for: that is the failure to say. A failed next page is not
    // the list's failure: the pages read stand.
    error: people.members === undefined ? (people.error ?? failure) : undefined,
    settled: read || (org === undefined && (failure !== undefined || none || choosing)),
  };
}
