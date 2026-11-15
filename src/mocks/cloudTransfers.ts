// SPDX-License-Identifier: Apache-2.0
import {
  handleAcceptCloudTransfer,
  handleCancelCloudTransfer,
  handleDeclineCloudTransfer,
  handleListCloudTransferRecipients,
  handleListCloudTransfers,
  handleTransferCloudSession,
} from '@gen/api/msw.gen';
import type { CloudSession, CloudTransfer, CloudTransferRecipient } from '@gen/api/types.gen';
import { zCreateCloudTransferRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { readJson, refusal } from './http';

/** The ownership transfers of cloud sessions (`runners.cloud.transfer.v1`), as `runners` of ostrom-server keeps them. */
export interface CloudTransfersState {
  cloudTransfers: CloudTransfer[];
  /** The sessions: a transfer moves the one it names. */
  cloudSessions: CloudSession[];
}

export interface CloudTransfersAccess {
  /** The caller's member id. */
  readonly memberId: (request: Request) => string | undefined;
  /** Whether the caller administers the organization: their transfer is accepted at once. */
  readonly manages: (request: Request) => boolean;
}

/** Everyone who can own a session: the server names the id, the login and whether the member is an administrator. */
export const TRANSFER_RECIPIENTS: readonly CloudTransferRecipient[] = [
  { id: MEMBER_IDS.maya, login: 'maya', administrator: true },
  { id: MEMBER_IDS.theo, login: 'theo', administrator: false },
  { id: MEMBER_IDS.samir, login: 'samir', administrator: false },
];

export function initialCloudTransfers(): Pick<CloudTransfersState, 'cloudTransfers'> {
  return {
    cloudTransfers: [
      {
        id: 'tr-1',
        sessionId: 'cs-27',
        fromMemberId: MEMBER_IDS.theo,
        toMemberId: MEMBER_IDS.maya,
        state: 'offered',
        initiatedBy: MEMBER_IDS.theo,
        resume: true,
        createdAt: '2026-10-30T07:00:00.000Z',
        updatedAt: '2026-10-30T07:00:00.000Z',
        expiresAt: '2026-11-06T07:00:00.000Z',
      },
    ],
  };
}

const NOT_FOUND = () => refusal(404, 'transfer_not_found', 'There is no such transfer.');

function change(
  state: CloudTransfersState,
  id: string,
  next: (transfer: CloudTransfer) => Partial<CloudTransfer>,
  now: Date,
): Response {
  const transfer = state.cloudTransfers.find((item) => item.id === id);
  if (transfer === undefined) return NOT_FOUND();
  if (transfer.state !== 'offered' && transfer.state !== 'accepted')
    return refusal(409, 'transfer_not_open', 'The transfer is no longer open.');
  const changed: CloudTransfer = { ...transfer, ...next(transfer), updatedAt: now.toISOString() };
  state.cloudTransfers = state.cloudTransfers.map((item) => (item.id === id ? changed : item));
  return HttpResponse.json(changed);
}

function moveSession(state: CloudTransfersState, sessionId: string, status: string): void {
  state.cloudSessions = state.cloudSessions.map((session) =>
    session.id === sessionId ? { ...session, status } : session,
  );
}

export function createCloudTransferHandlers(
  state: () => CloudTransfersState,
  access: CloudTransfersAccess,
  now: () => Date,
): HttpHandler[] {
  return [
    handleListCloudTransferRecipients(() => HttpResponse.json({ recipients: [...TRANSFER_RECIPIENTS] })),
    handleListCloudTransfers(() => HttpResponse.json({ items: state().cloudTransfers })),
    handleTransferCloudSession(async ({ request, params }) => {
      const body = zCreateCloudTransferRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_transfer', 'toMemberId is the recipient.');
      const session = state().cloudSessions.find((item) => item.id === params.id);
      if (session === undefined) return refusal(404, 'not_found', 'cloud session not found');
      const to = TRANSFER_RECIPIENTS.find((item) => item.id === body.data.toMemberId);
      if (to === undefined)
        return refusal(422, 'recipient_ineligible', 'The recipient cannot own this session.');
      const immediate = access.manages(request);
      const created: CloudTransfer = {
        id: `tr-${String(state().cloudTransfers.length + 1)}`,
        sessionId: session.id,
        fromMemberId: access.memberId(request) ?? MEMBER_IDS.maya,
        toMemberId: to.id,
        state: immediate ? 'accepted' : 'offered',
        initiatedBy: access.memberId(request) ?? MEMBER_IDS.maya,
        resume: body.data.resume,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
        ...(immediate ? {} : { expiresAt: new Date(now().getTime() + 7 * 86_400_000).toISOString() }),
      };
      state().cloudTransfers = [created, ...state().cloudTransfers];
      if (immediate) moveSession(state(), session.id, 'transferring');
      return HttpResponse.json(created, { status: 202 });
    }),
    handleAcceptCloudTransfer(({ params }) => {
      const answer = change(
        state(),
        params.id,
        () => ({ state: 'accepted', decidedAt: now().toISOString() }),
        now(),
      );
      const accepted = state().cloudTransfers.find((item) => item.id === params.id);
      if (answer.ok && accepted !== undefined) moveSession(state(), accepted.sessionId, 'transferring');
      return answer;
    }),
    handleDeclineCloudTransfer(({ params }) =>
      change(state(), params.id, () => ({ state: 'declined', decidedAt: now().toISOString() }), now()),
    ),
    handleCancelCloudTransfer(({ params }) => {
      const answer = change(
        state(),
        params.id,
        () => ({ state: 'cancelled', decidedAt: now().toISOString() }),
        now(),
      );
      const cancelled = state().cloudTransfers.find((item) => item.id === params.id);
      if (answer.ok && cancelled !== undefined) moveSession(state(), cancelled.sessionId, 'running');
      return answer;
    }),
  ];
}
