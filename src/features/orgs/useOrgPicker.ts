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
  /** There is an organization to show or one to choose: nothing in the top bar otherwise (signed out, say). */
  readonly relevant: boolean;
  readonly picking: boolean;
  /** The organization last chosen is unknown to the server for this person. */
  readonly unknown: boolean;
  readonly choose: (id: string) => boolean;
  readonly open: () => void;
  readonly close: () => void;
}

/**
 * The organization the console acts in. `/me` names it, and who is signed in; a 409 `org_required` on any call asks
 * for it (shared/api/apiClient.ts). A chosen organization the server answers 404 for is dropped, and the person told.
 */
export function useOrgPicker(): OrgPickerViewModel {
  // The same freshness as `useViewer`: one `/me` for both.
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  const viewer = meOf(me.data);
  const state = useOrgStore();
  const { named, forget } = state;
  useEffect(() => {
    if (viewer !== undefined) named(viewer.organization, viewer.dev.login);
  }, [viewer, named]);
  const lost = state.current !== undefined && isApiFailure(me.error) && me.error.kind === 'not-found';
  useEffect(() => {
    if (lost) forget('unknown');
  }, [lost, forget]);
  return {
    currentId: state.current,
    current: state.seen.find((choice) => choice.id === state.current),
    choices: state.seen,
    relevant: state.current !== undefined || state.asked || state.unknown,
    picking: state.picking,
    unknown: state.unknown,
    choose: state.choose,
    open: state.open,
    close: state.close,
  };
}
