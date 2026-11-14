// SPDX-License-Identifier: Apache-2.0
import { type OrgMembers, useOrgMembers } from './members';
import { useCurrentOrg } from './useCurrentOrg';

export interface CurrentOrgMembers extends OrgMembers {
  /** The members came back, failed, or cannot be asked for (no organization to ask in): nothing more is awaited. */
  readonly settled: boolean;
}

/**
 * The members of the organization the console acts in, read from `GET /orgs/{org}/members` (the route the server
 * serves) once the organization is known, a page of a hundred at a time. Only names and pickers use it: a refusal is
 * not asked again, and the screen opens without them.
 */
export function useCurrentOrgMembers(): CurrentOrgMembers {
  const { org, failure, none, choosing } = useCurrentOrg();
  const people = useOrgMembers(org?.id ?? '', {
    enabled: org !== undefined,
    staleTime: 60_000,
    retry: false,
  });
  return {
    ...people,
    // Without an organization the members cannot be asked for: that is the failure to say.
    error: people.error ?? failure,
    settled: !people.pending || (org === undefined && (failure !== undefined || none || choosing)),
  };
}
