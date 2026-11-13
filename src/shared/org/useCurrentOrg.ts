// SPDX-License-Identifier: Apache-2.0
import { listOrgsOptions } from '@gen/api/@tanstack/react-query.gen';
import type { OrgView } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useOrgStore } from './orgStore';
import { type OrgRole, orgRoleOf } from './roles';

export interface CurrentOrg {
  /** The organization the console acts in, as its member sees it: id, short name, name and their role. */
  readonly org: OrgView | undefined;
  /** The person's role in it; none for a role the console does not know, which gives no right. */
  readonly role: OrgRole | undefined;
  /** Signed in and a member of no organization yet: the console offers to create one. */
  readonly none: boolean;
  /** Several organizations and none chosen: the picker is asked to open. */
  readonly choosing: boolean;
  readonly failure: Error | undefined;
  /** Opens the picker. */
  readonly choose: () => void;
}

/**
 * The organization a screen under `/api/v1/orgs/{org}/…` acts in, read from the person's own list (`GET /orgs`,
 * which takes no `Ostrom-Org`): the one chosen in the picker, else the only one. With several and no choice, the
 * picker opens; with none, the screen says how to create one.
 */
export function useCurrentOrg(): CurrentOrg {
  const current = useOrgStore((state) => state.current);
  const ask = useOrgStore((state) => state.ask);
  const choose = useOrgStore((state) => state.open);
  const list = useQuery(ready(listOrgsOptions(), { staleTime: 60_000 }));
  const items = list.data?.items;
  const chosen = current === undefined ? undefined : items?.find((item) => item.id === current);
  const org = chosen ?? (items?.length === 1 ? items[0] : undefined);
  const choosing = items !== undefined && org === undefined && items.length > 1;
  useEffect(() => {
    if (choosing) ask();
  }, [choosing, ask]);
  return {
    org,
    role: orgRoleOf(org?.role),
    none: items?.length === 0,
    choosing,
    failure: failureOf(list.error),
    choose,
  };
}
