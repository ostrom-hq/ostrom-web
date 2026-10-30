// SPDX-License-Identifier: AGPL-3.0-only
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { ready } from '@/shared/api/ready';
import { meOf } from '@/shared/auth/me';
import { type OrgChoice, useOrgStore } from '@/shared/org/orgStore';

export interface OrgPickerViewModel {
  /** The id the console acts in, sent as `Ostrom-Org`. */
  readonly currentId: string | undefined;
  /** The same organization with its name, once the server named it. */
  readonly current: OrgChoice | undefined;
  readonly choices: readonly OrgChoice[];
  readonly picking: boolean;
  readonly choose: (id: string) => boolean;
  readonly open: () => void;
  readonly close: () => void;
}

/**
 * The organization the console acts in. `/me` names it, and the console adopts it when nothing was chosen; a 409
 * `org_required` on any call opens the picker (shared/api/apiClient.ts). A chosen organization the server answers
 * 404 for (the person left it, or another account signed in) is dropped, so the server is asked afresh.
 */
export function useOrgPicker(): OrgPickerViewModel {
  const me = useQuery(ready(getMeOptions(), { retry: false }));
  const organization = meOf(me.data)?.organization;
  const currentId = useOrgStore((state) => state.current);
  const seen = useOrgStore((state) => state.seen);
  const picking = useOrgStore((state) => state.picking);
  const { adopt, choose, open, close, forget } = useOrgStore.getState();
  useEffect(() => {
    if (organization !== undefined) adopt(organization);
  }, [organization, adopt]);
  const lost = currentId !== undefined && isApiFailure(me.error) && me.error.kind === 'not-found';
  useEffect(() => {
    if (lost) forget();
  }, [lost, forget]);
  return {
    currentId,
    current: seen.find((choice) => choice.id === currentId),
    choices: seen,
    picking,
    choose,
    open,
    close,
  };
}
