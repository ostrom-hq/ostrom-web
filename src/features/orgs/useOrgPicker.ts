// SPDX-License-Identifier: AGPL-3.0-only
import { getMeOptions, listMyOrganizationsOptions } from '@gen/api/@tanstack/react-query.gen';
import type { Organization } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { meOf } from '@/shared/auth/me';
import { useOrgStore } from '@/shared/org/orgStore';
import { nextStep } from './model';

export interface OrgOption {
  readonly organization: Organization;
  /** The organization the console acts in now. */
  readonly current: boolean;
  readonly choose: () => void;
}

export interface OrgPickerViewModel {
  /** The organization the console acts in, once the list named it. */
  readonly current: Organization | undefined;
  readonly options: readonly OrgOption[];
  readonly loading: boolean;
  readonly failure: Error | undefined;
  /** Reads the list again, after a failure. */
  readonly retry: () => void;
  /** Someone is signed in and has an organization to show or to choose: nothing in the top bar otherwise. */
  readonly relevant: boolean;
  readonly picking: boolean;
  /** The organization chosen before is not one of the person's any more. */
  readonly unknown: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

/**
 * The organization the console acts in, from the person's own list (`GET /me/organizations`, which needs no
 * `Ostrom-Org`): the only one is taken, several are asked about, a choice that is no longer theirs is dropped. A 409
 * `org_required` on any call asks too (shared/api/apiClient.ts).
 */
export function useOrgPicker(): OrgPickerViewModel {
  // The same freshness as `useViewer`: one `/me` for both.
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  const login = meOf(me.data)?.dev.login;
  const list = useQuery(
    ready(listMyOrganizationsOptions(), { staleTime: 60_000, enabled: login !== undefined }),
  );
  const organizations = list.data?.items;
  const { current, owner, asked, picking, unknown, choose, only, ask, forget, open, close } = useOrgStore(
    useShallow((state) => ({
      current: state.current,
      owner: state.owner,
      asked: state.asked,
      picking: state.picking,
      unknown: state.unknown,
      choose: state.choose,
      only: state.only,
      ask: state.ask,
      forget: state.forget,
      open: state.open,
      close: state.close,
    })),
  );
  useEffect(() => {
    if (login === undefined || organizations === undefined) return;
    const step = nextStep({ current, owner, login, organizations });
    if (step.kind === 'forget') forget(step.reason);
    else if (step.kind === 'only') only(step.id, login);
    else if (step.kind === 'ask') ask();
  }, [login, organizations, current, owner, only, ask, forget]);
  const options = useMemo(
    () =>
      login === undefined || organizations === undefined
        ? []
        : organizations.map((organization) => ({
            organization,
            current: organization.id === current,
            choose: () => {
              choose(organization.id, login);
            },
          })),
    [login, organizations, current, choose],
  );
  return {
    current: organizations?.find((organization) => organization.id === current),
    options,
    loading: list.isLoading,
    failure: failureOf(list.error),
    retry: () => {
      void list.refetch();
    },
    relevant: login !== undefined && (current !== undefined || asked || unknown),
    picking,
    unknown,
    open,
    close,
  };
}
