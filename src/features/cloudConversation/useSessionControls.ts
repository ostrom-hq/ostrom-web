// SPDX-License-Identifier: Apache-2.0
import { getCloudSessionQueryKey } from '@gen/api/@tanstack/react-query.gen';
import { setCloudPermissionBypass, setCloudSessionEffort, setCloudSessionModel } from '@gen/api/sdk.gen';
import type { CloudSessionResponse } from '@gen/api/types.gen';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useViewer } from '@/shared/auth/useViewer';
import { useAnnounced } from '@/shared/capabilities';
import { errorOf } from './pending';
import { ENDED } from './useCloudConversation';

export interface SessionControlsViewModel {
  /** The viewer owns the session: only they change its model, its effort and its standing approval. */
  readonly owner: boolean;
  /** The owner may turn the standing approval of tool uses on and off (`runners.cloud.permissions.bypass.v1`). */
  readonly bypassAvailable: boolean;
  /** The card offers "Bypass": available, and not on yet. */
  readonly bypassOffered: boolean;
  /** The owner may change the model (`runners.cloud.model.v1`) or the effort (`runners.cloud.effort.v1`) while it is not over. */
  readonly modelAvailable: boolean;
  readonly effortAvailable: boolean;
  /** An action is on its way: the others wait for it. */
  readonly acting: boolean;
  /** Why the last action failed, the server's sentence. */
  readonly failure: Error | undefined;
  /** Resolves true once the server took it. */
  readonly setBypass: (enabled: boolean) => Promise<boolean>;
  /** A value the picker checked as the server does: trimmed, 1 to 120 of letters, digits and `. _ : / -`. */
  readonly setModel: (model: string) => void;
  readonly setEffort: (effort: string) => void;
}

/**
 * The session's own settings, as TeamCode's companion changes them from its session screen: the standing approval of
 * tool uses, the model and the effort. Each answer is the session as it now is, which the header shows at once.
 */
export function useSessionControls(session: CloudSessionResponse): SessionControlsViewModel {
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const bypass = useAnnounced('runners.cloud.permissions.bypass.v1');
  const model = useAnnounced('runners.cloud.model.v1');
  const effort = useAnnounced('runners.cloud.effort.v1');
  const [acting, setActing] = useState(false);
  const [failure, setFailure] = useState<Error | undefined>(undefined);
  const busy = useRef(false);
  const { id } = session;

  const act = useCallback(
    async (action: (sessionId: string) => Promise<CloudSessionResponse>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setActing(true);
      setFailure(undefined);
      try {
        const next = await action(id);
        queryClient.setQueryData(getCloudSessionQueryKey({ path: { id } }), next);
        return true;
      } catch (error) {
        setFailure(errorOf(error));
        return false;
      } finally {
        busy.current = false;
        setActing(false);
      }
    },
    [id, queryClient],
  );

  const setBypass = useCallback(
    async (enabled: boolean) =>
      act(async (sessionId) => {
        const { data } = await setCloudPermissionBypass({
          path: { id: sessionId },
          body: { enabled },
          throwOnError: true,
        });
        return data;
      }),
    [act],
  );

  const setModel = useCallback(
    (value: string) => {
      void act(async (sessionId) => {
        const { data } = await setCloudSessionModel({
          path: { id: sessionId },
          body: { model: value },
          throwOnError: true,
        });
        return data;
      });
    },
    [act],
  );

  const setEffort = useCallback(
    (value: string) => {
      void act(async (sessionId) => {
        const { data } = await setCloudSessionEffort({
          path: { id: sessionId },
          body: { effort: value },
          throwOnError: true,
        });
        return data;
      });
    },
    [act],
  );

  const owner = viewer.login !== undefined && session.owner === viewer.login;
  const open = owner && !ENDED.has(session.status);
  return {
    owner,
    bypassAvailable: bypass && open,
    bypassOffered: bypass && open && session.permissionBypass === false,
    modelAvailable: model && open,
    effortAvailable: effort && open,
    acting,
    failure,
    setBypass,
    setModel,
    setEffort,
  };
}
