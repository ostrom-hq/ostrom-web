// SPDX-License-Identifier: Apache-2.0
import {
  getGithubLinkOptions,
  getGithubLinkQueryKey,
  listGithubLinksOptions,
  listGithubLinksQueryKey,
  unlinkGithubMutation,
  unlinkMemberGithubMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { GitHubLink } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useOrgMembers } from '@/shared/org/members';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { linkRows, linkUrl, type MemberLinkRow, memberLinkUrl } from './model';

export interface OwnLinkViewModel {
  readonly link: GitHubLink | undefined;
  readonly failure: Error | undefined;
  /** Where the browser goes to link, or to link again; undefined while the server cannot (no App configured). */
  readonly start: string | undefined;
  readonly unlink: () => void;
  readonly unlinking: boolean;
  /** Why the unlink was refused. */
  readonly unlinkFailure: Error | undefined;
}

/** The caller's own GitHub link, and the two gestures on it: the web flow's address, and unlink. */
export function useOwnLink(org: string): OwnLinkViewModel {
  const queryClient = useQueryClient();
  const link = useQuery(ready(getGithubLinkOptions(), { staleTime: 30_000 }));
  const unlink = useMutation({
    ...unlinkGithubMutation(),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: getGithubLinkQueryKey() });
      await queryClient.invalidateQueries({ queryKey: listGithubLinksQueryKey() });
    },
  });
  const { mutate, reset } = unlink;
  const go = useCallback(() => {
    reset();
    mutate({});
  }, [mutate, reset]);
  return {
    link: link.data,
    failure: failureOf(link.error),
    start: link.data?.appConfigured === false ? undefined : linkUrl(org),
    unlink: go,
    unlinking: unlink.isPending,
    unlinkFailure: failureOf(unlink.error),
  };
}

export interface MemberLinksViewModel {
  /** Every member with their link; undefined until both are read. */
  readonly rows: readonly MemberLinkRow[] | undefined;
  /** Whether the members read are all of them: a long list is read a hundred at a time. */
  readonly more: (() => void) | undefined;
  readonly failure: Error | undefined;
  /** Whether the instance's App can link accounts: without it, no link is offered. */
  readonly appConfigured: boolean;
  readonly startFor: (memberId: string) => string;
  readonly unlink: (memberId: string) => void;
  /** The member being unlinked. */
  readonly unlinking: string | undefined;
  readonly unlinkFailure: Error | undefined;
}

/** The members' links, for an owner or an admin: nobody else may read them, so nothing is asked of anyone else. */
export function useMemberLinks(
  org: string,
  role: OrgRole | undefined,
  appConfigured: boolean,
): MemberLinksViewModel {
  const queryClient = useQueryClient();
  const enabled = managesMembers(role);
  const links = useQuery(ready(listGithubLinksOptions(), { enabled, retry: false }));
  const people = useOrgMembers(org, { enabled, retry: false });
  const unlink = useMutation({
    ...unlinkMemberGithubMutation(),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listGithubLinksQueryKey() });
    },
  });
  const { mutate, reset } = unlink;
  const go = useCallback(
    (memberId: string) => {
      reset();
      mutate({ path: { memberId } });
    },
    [mutate, reset],
  );
  const startFor = useCallback((memberId: string) => memberLinkUrl(org, memberId), [org]);
  const items = links.data?.items;
  const members = people.members;
  return {
    rows: items === undefined || members === undefined ? undefined : linkRows(members, items),
    more: people.more,
    failure: failureOf(links.error ?? people.error),
    appConfigured,
    startFor,
    unlink: go,
    unlinking: unlink.isPending ? unlink.variables.path.memberId : undefined,
    unlinkFailure: failureOf(unlink.error),
  };
}
