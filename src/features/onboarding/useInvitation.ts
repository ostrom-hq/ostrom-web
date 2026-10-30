// SPDX-License-Identifier: AGPL-3.0-only
import {
  acceptInvitationMutation,
  getMeOptions,
  listMyOrganizationsQueryKey,
  listOrgsOptions,
  listOrgsQueryKey,
  previewInvitationMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { InvitationPreview, OrgView } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { meOf } from '@/shared/auth/me';
import { useOrgStore } from '@/shared/org/orgStore';
import { inviteToken } from './inviteLink';

/**
 * `missing`: no invitation was opened in this tab. `dead`: used up, expired, revoked or never was. `reading`: the
 * preview is on its way. `open`: the preview is there, to accept.
 */
export type InvitationState = 'missing' | 'reading' | 'dead' | 'open';

/** An invitation read and still alive: what it leads to, and the way in. */
export interface OpenInvitation {
  readonly preview: InvitationPreview;
  /** Joins; none until someone signed in is known. */
  readonly accept: (() => void) | undefined;
  /** Opens the organization, for a person already in it; none until someone signed in is known. */
  readonly enter: (() => void) | undefined;
}

export interface InvitationViewModel {
  readonly state: InvitationState;
  /** Set once the preview is there (`open`). */
  readonly open: OpenInvitation | undefined;
  /** Undefined while `/me` is read; then whether someone is signed in to accept. */
  readonly signedIn: boolean | undefined;
  readonly accepting: boolean;
  /** The person is already in the organization (the server answers 409). */
  readonly already: boolean;
  /** The organization is being opened. */
  readonly entering: boolean;
  /**
   * The server refused this account. An e-mail invitation for another address answers 404, as a dead one does: only
   * an e-mail invitation can be refused, a link that answers 404 is dead.
   */
  readonly refused: boolean;
  readonly failure: Error | undefined;
}

/**
 * Reads what an invitation leads to (the preview needs no session), then joins with it. Once joined, the
 * organization is the one the console acts in and the home screen opens.
 */
export function useInvitation(): InvitationViewModel {
  const [token] = useState(inviteToken.read);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const choose = useOrgStore((state) => state.choose);
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000, retry: false }));
  const viewer = meOf(me.data);
  const preview = useMutation({
    ...previewInvitationMutation(),
    // A dead invitation is forgotten; one the network kept from reading stays, for a reload.
    onError: (error) => {
      const failure = failureOf(error);
      if (isApiFailure(failure) && failure.kind === 'not-found') inviteToken.drop();
    },
  });
  const accept = useMutation(acceptInvitationMutation());
  const [entering, setEntering] = useState(false);
  /** Once joined: the organization is the person's choice, kept with their login, and the console opens. */
  const joined = useCallback(
    async (org: OrgView | string, login: string) => {
      inviteToken.drop();
      // The lists first, as for an organization created: chosen before, the new one would be taken for one left.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listOrgsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: listMyOrganizationsQueryKey() }),
      ]);
      // Already in it: the invitation names its short name only, the person's list gives its id.
      const id =
        typeof org === 'string'
          ? (
              await queryClient.query(ready(listOrgsOptions(), { retry: false })).catch(() => undefined)
            )?.items.find((item) => item.slug === org)?.id
          : org.id;
      if (id !== undefined) choose(id, login);
      await navigate({ to: '/', replace: true });
    },
    [queryClient, choose, navigate],
  );
  const { mutate: read } = preview;
  useEffect(() => {
    if (token !== undefined) read({ body: { token } });
  }, [token, read]);
  const { mutate: join } = accept;
  const acceptFailure = failureOf(accept.error);
  const already = isApiFailure(acceptFailure) && acceptFailure.kind === 'conflict';
  const turnedAway = isApiFailure(acceptFailure) && acceptFailure.kind === 'not-found';
  // A link names nobody: refused, it is dead (revoked, used up or expired since it was read).
  const seen = preview.isSuccess ? preview.data : undefined;
  const forSomeone = typeof seen?.email === 'string';
  const refused = turnedAway && forSomeone;
  const previewFailure = failureOf(preview.error);
  const dead =
    (isApiFailure(previewFailure) && previewFailure.kind === 'not-found') || (turnedAway && !forSomeone);
  let state: InvitationState = 'reading';
  if (token === undefined) state = 'missing';
  else if (dead) state = 'dead';
  else if (preview.isSuccess) state = 'open';
  // Joining needs someone signed in: until `/me` names them, there is no way in.
  const login = viewer?.dev.login;
  const open =
    seen !== undefined && token !== undefined
      ? {
          preview: seen,
          accept:
            login === undefined
              ? undefined
              : () => {
                  join(
                    { body: { token } },
                    {
                      onSuccess: (org) => {
                        void joined(org, login);
                      },
                      onError: (error) => {
                        // Dead, or already in: the secret is of no more use. One for another address is kept, for
                        // the account that holds it.
                        const failure = failureOf(error);
                        if (
                          isApiFailure(failure) &&
                          (failure.kind === 'conflict' || (failure.kind === 'not-found' && !forSomeone))
                        )
                          inviteToken.drop();
                      },
                    },
                  );
                },
          enter:
            login === undefined
              ? undefined
              : () => {
                  setEntering(true);
                  void joined(seen.orgSlug, login);
                },
        }
      : undefined;
  return {
    state,
    open,
    signedIn: me.isPending ? undefined : viewer !== undefined,
    accepting: accept.isPending || accept.isSuccess,
    already,
    entering,
    refused,
    failure: dead ? undefined : (previewFailure ?? (already || refused ? undefined : acceptFailure)),
  };
}
