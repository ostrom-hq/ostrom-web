// SPDX-License-Identifier: AGPL-3.0-only
import { listOrgMembersOptions } from '@gen/api/@tanstack/react-query.gen';
import { listOrgMembers } from '@gen/api/sdk.gen';
import type { OrgMember, OrgMemberList } from '@gen/api/types.gen';

/** The members a page asks the server for: the screens show a hundred at a time. */
export const MEMBERS_PAGE = 100;

/** Every member of the organization, read a page at a time, `after` the previous page's `next`. */
export async function everyMember(org: string, signal: AbortSignal): Promise<OrgMemberList> {
  const items: OrgMember[] = [];
  let after: string | undefined;
  do {
    const { data } = await listOrgMembers({
      path: { org },
      query: after === undefined ? { limit: MEMBERS_PAGE } : { limit: MEMBERS_PAGE, after },
      signal,
      throwOnError: true,
    });
    items.push(...data.items);
    after = data.next;
  } while (after !== undefined);
  return { items };
}

/**
 * The members query every screen shares: the generated key, so a change invalidates it as before, and every page
 * read into one list.
 */
export function orgMembersOptions(org: string): ReturnType<typeof listOrgMembersOptions> {
  return {
    ...listOrgMembersOptions({ path: { org } }),
    queryFn: async ({ signal }: { readonly signal: AbortSignal }) => everyMember(org, signal),
  };
}
