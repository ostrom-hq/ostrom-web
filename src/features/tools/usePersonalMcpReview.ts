// SPDX-License-Identifier: Apache-2.0
import {
  listMcpServersOptions,
  listMcpServersQueryKey,
  listMembersOptions,
  listMyMcpServersQueryKey,
  promoteMcpServerMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { McpServer } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { memberLabel } from './model';

export interface PersonalMcpReviewViewModel {
  /** The members' own servers, by owner, with their definition: never a credential. */
  readonly servers: readonly McpServer[] | undefined;
  /** "Maya Lind (maya)" for an owner the member list knows, their id otherwise. */
  readonly ownerOf: (id: string) => string;
  readonly failure: Error | undefined;
}

/** The members' own MCP servers, for an administrator's review (`GET /api/v1/mcp/servers?personal=true`). */
export function usePersonalMcpReview(): PersonalMcpReviewViewModel {
  const servers = useQuery(ready(listMcpServersOptions({ query: { personal: true } })));
  // Only names: a refusal is not asked again, an owner then reads as their member id.
  const members = useQuery(ready(listMembersOptions(), { staleTime: 60_000, retry: false }));
  const known = members.data?.items;
  const ownerOf = useCallback(
    (id: string) => {
      const member = known?.find((candidate) => candidate.id === id);
      return member === undefined ? id : memberLabel(member);
    },
    [known],
  );
  return { servers: servers.data?.items, ownerOf, failure: failureOf(servers.error) };
}

export interface PersonalMcpPromoteViewModel {
  readonly promote: (name: string) => void;
  /** The server being promoted. */
  readonly pending: string | undefined;
  readonly failure: Error | undefined;
}

/**
 * Makes a member's own server a team server: its owner keeps their assignment, everyone else reaches it only by
 * assignment. Both lists are read again: the server leaves the review and joins the team's.
 */
export function usePersonalMcpPromote(): PersonalMcpPromoteViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listMcpServersQueryKey() }),
      // An administrator promoting their own server sees it leave their own list too.
      queryClient.invalidateQueries({ queryKey: listMyMcpServersQueryKey() }),
    ]);
  }, [queryClient]);
  const promote = useMutation({ ...promoteMcpServerMutation(), onSettled: refresh });
  const { mutate } = promote;
  return {
    promote: useCallback(
      (name: string) => {
        mutate({ path: { name } });
      },
      [mutate],
    ),
    pending: promote.isPending ? promote.variables.path.name : undefined,
    failure: failureOf(promote.error),
  };
}
