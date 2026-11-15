// SPDX-License-Identifier: Apache-2.0
import {
  acceptCloudTransferMutation,
  cancelCloudTransferMutation,
  declineCloudTransferMutation,
  listCloudSessionsQueryKey,
  listCloudTransferRecipientsOptions,
  listCloudTransfersOptions,
  listCloudTransfersQueryKey,
  transferCloudSessionMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { CloudTransfer, CloudTransferRecipient } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import { useViewer } from '@/shared/auth/useViewer';
import { createRefused, type PendingCreate, pressOf } from './createKey';

const POLL_MS = 10_000;

async function skipValidation(): Promise<undefined> {
  await Promise.resolve();
  return undefined;
}

export interface TransfersViewModel {
  /** The caller's transfers, incoming and outgoing, newest first; undefined while they are read. */
  readonly transfers: readonly CloudTransfer[] | undefined;
  /** The members a session can be given to; empty when the server refuses the list (transfers are not offered). */
  readonly recipients: readonly CloudTransferRecipient[];
  /** The login of each member the server named, to say who gives and who receives. */
  readonly logins: ReadonlyMap<string, string>;
  /** Why the recipients could not be read, as the server wrote it: said in the picker. */
  readonly recipientsFailure: Error | undefined;
  readonly failure: Error | undefined;
  /** The caller's member id: an offer is theirs to accept when it is made to them. */
  readonly memberId: string | undefined;
  readonly canManage: boolean;
}

/** The caller's transfers and the members they can give a session to; a transfer moves, so the list follows it. */
export function useTransfers(): TransfersViewModel {
  const enabled = useAnnounced('runners.cloud.transfer.v1');
  const list = useQuery({
    ...ready(listCloudTransfersOptions({ query: { direction: 'all' } }), {
      refetchInterval: pollUnlessRefused(POLL_MS),
    }),
    enabled,
  });
  const recipients = useQuery({ ...ready(listCloudTransferRecipientsOptions(), { retry: false }), enabled });
  const viewer = useViewer();
  const people = recipients.data?.recipients;
  const logins = useMemo(() => new Map((people ?? []).map((person) => [person.id, person.login])), [people]);
  return {
    transfers: list.data?.items,
    recipients: people ?? [],
    logins,
    recipientsFailure: failureOf(recipients.error),
    failure: failureOf(list.error),
    memberId: viewer.memberId,
    canManage: viewer.canManage,
  };
}

export interface TransferChangeViewModel {
  /** `onDone` runs once the server took the request: the form closes then, not before. */
  readonly offer: (sessionId: string, toMemberId: string, resume: boolean, onDone: () => void) => void;
  readonly accept: (id: string) => void;
  readonly decline: (id: string) => void;
  readonly cancel: (id: string) => void;
  /** The session being offered, or the transfer being answered. */
  readonly busy: string | undefined;
  readonly failure: Error | undefined;
}

/** Asking for a transfer, and answering one: the recipient accepts or declines, the owner cancels. */
export function useTransferChange(): TransferChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listCloudTransfersQueryKey() }),
      queryClient.invalidateQueries({ queryKey: listCloudSessionsQueryKey() }),
    ]);
  }, [queryClient]);
  // The refresh is not awaited: the server took the request, so a failed re-read must not turn it into an error.
  const request = useMutation({
    ...transferCloudSessionMutation(),
    onSuccess: () => {
      void refresh();
    },
  });
  const acceptation = useMutation({ ...acceptCloudTransferMutation(), onSettled: refresh });
  const refusal = useMutation({ ...declineCloudTransferMutation(), onSettled: refresh });
  const withdrawal = useMutation({ ...cancelCloudTransferMutation(), onSettled: refresh });
  const pending = useRef<PendingCreate | undefined>(undefined);
  const { mutate: requestMutate, reset: resetRequest } = request;
  const { mutate: acceptMutate, reset: resetAccept } = acceptation;
  const { mutate: declineMutate, reset: resetDecline } = refusal;
  const { mutate: cancelMutate, reset: resetCancel } = withdrawal;
  const resetAll = useCallback(() => {
    resetRequest();
    resetAccept();
    resetDecline();
    resetCancel();
  }, [resetRequest, resetAccept, resetDecline, resetCancel]);
  const offer = useCallback(
    (sessionId: string, toMemberId: string, resume: boolean, onDone: () => void) => {
      resetAll();
      const body = { toMemberId, resume };
      // One key per press, kept while its answer is unknown so that pressing again cannot open a second transfer.
      const press = pressOf(pending.current, { sessionId, ...body });
      pending.current = press;
      requestMutate(
        {
          path: { id: sessionId },
          body,
          headers: { 'Idempotency-Key': press.key },
          // The generated client validates a request after merging its headers into a `Headers`, which a schema with a
          // required header never matches. Every other `Idempotency-Key` in the contract is optional (so the schema
          // passes vacuously); this route's is required (400 `idempotency_key_required`), hence the one skip: the types
          // check the request, the server the key.
          requestValidator: skipValidation,
        },
        {
          onSuccess: () => {
            pending.current = undefined;
            onDone();
          },
          onError: (error) => {
            if (createRefused(error)) pending.current = undefined;
          },
        },
      );
    },
    [requestMutate, resetAll],
  );
  const accept = useCallback(
    (id: string) => {
      resetAll();
      acceptMutate({ path: { id } });
    },
    [acceptMutate, resetAll],
  );
  const decline = useCallback(
    (id: string) => {
      resetAll();
      declineMutate({ path: { id } });
    },
    [declineMutate, resetAll],
  );
  const cancel = useCallback(
    (id: string) => {
      resetAll();
      cancelMutate({ path: { id } });
    },
    [cancelMutate, resetAll],
  );
  const answering = acceptation.isPending
    ? acceptation.variables.path.id
    : refusal.isPending
      ? refusal.variables.path.id
      : withdrawal.isPending
        ? withdrawal.variables.path.id
        : undefined;
  return {
    offer,
    accept,
    decline,
    cancel,
    busy: request.isPending ? request.variables.path.id : answering,
    failure: failureOf(request.error ?? acceptation.error ?? refusal.error ?? withdrawal.error),
  };
}
