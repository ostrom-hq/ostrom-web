// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleAnswerApproval,
  handleGetApproval,
  handleGetMe,
  handleGetReceipt,
  handleGetReceiptBundle,
  handleGetSession,
  handleListApprovals,
  handleListReceipts,
  handleListSessions,
  handleVerifyReceipt,
} from '@gen/api/msw.gen';
import type { ApiError, Approval, ApprovalAnswer, PublicKey, Receipt, Session } from '@gen/api/types.gen';
import { zAnswerApprovalRequest } from '@gen/api/zod.gen';
import { HttpResponse, type HttpHandler } from 'msw';
import { initialApprovals, initialApprovers, me } from '@/mocks/fixtures/approvals';
import { initialReceipts, initialSessions } from '@/mocks/fixtures/sessions';

export interface MockDb {
  approvals: Approval[];
  /** Who may answer each approval, by id. */
  approvers: Record<string, readonly string[]>;
  sessions: Session[];
  /** Newest first, as the server lists them; an answer adds its receipt at the top. */
  receipts: Receipt[];
}

export function createMockDb(): MockDb {
  return {
    approvals: initialApprovals(),
    approvers: initialApprovers(),
    sessions: initialSessions(),
    receipts: initialReceipts(),
  };
}

/** The mock's stand-in for the server's check: a receipt whose signature names no key does not verify. */
export const MOCK_KEY: PublicKey = {
  kid: '4f2a9c1b',
  alg: 'ed25519',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----',
};

/** Puts a database back to its first state in place: the running handlers keep their reference. */
export function resetMockDb(db: MockDb): void {
  Object.assign(db, createMockDb());
}

function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

function isAsker(approval: Approval, login: string): boolean {
  return (approval.askedBy ?? []).some((author) => author.toLowerCase() === login.toLowerCase());
}

/**
 * The server's rule (prototype `selfCheck`): the person who asked cannot approve while another approver exists;
 * as the only approver, the approval passes and is marked self-approved. A refusal always passes.
 */
export function selfApprovalRefusal(
  approval: Approval,
  approvers: readonly string[],
  login: string,
): string | undefined {
  const asked = new Set((approval.askedBy ?? []).map((author) => author.toLowerCase()));
  if (!asked.has(login.toLowerCase())) return undefined;
  const others = approvers.filter((approver) => !asked.has(approver.toLowerCase()));
  return others.length === 0 ? undefined : `You asked for this: ${others.join(' or ')} has to approve it.`;
}

function answered(approval: Approval, answer: ApprovalAnswer, selfApproved: boolean, at: string): Approval {
  return {
    ...approval,
    status: answer === 'approve' ? 'approved' : 'rejected',
    decidedBy: me.dev.login,
    decidedAt: at,
    ...(selfApproved ? { selfApproved } : {}),
  };
}

function receiptOf(approval: Approval, at: string): Receipt {
  return {
    id: `rcpt-${approval.id}`,
    subject: { kind: 'gate', id: approval.id, digest: approval.shownDigest },
    initiator: approval.askedBy?.[0] ?? me.dev.login,
    rules: [],
    decisions: [
      {
        approvalId: approval.id,
        by: me.dev.login,
        at,
        result: approval.status,
        ...(approval.selfApproved === true ? { selfApproved: true } : {}),
      },
    ],
    createdAt: at,
    signature: `ed25519;kid=4f2a9c1b;sha256=${approval.shownDigest};sig=mock`,
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** The approvals slice of the contract, served from memory with the server's rules. */
export function createHandlers(db: MockDb, now: () => Date = () => new Date()): HttpHandler[] {
  const find = (id: string): Approval | undefined => db.approvals.find((approval) => approval.id === id);
  const notFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'approval not found');
  const findReceipt = (id: string): Receipt | undefined => db.receipts.find((receipt) => receipt.id === id);
  const receiptNotFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'receipt not found');
  return [
    handleGetMe({ body: me }),
    handleListApprovals(({ request }) => {
      const query = new URL(request.url).searchParams;
      const status = query.get('status');
      const items = db.approvals.filter((approval) => {
        if (query.get('mine') === 'true') {
          return approval.status === 'pending' && (db.approvers[approval.id] ?? []).includes(me.dev.login);
        }
        return status === null || approval.status === status;
      });
      return HttpResponse.json({ items });
    }),
    handleGetApproval(({ params }) => {
      const approval = find(params.id);
      return approval === undefined ? notFound() : HttpResponse.json(approval);
    }),
    handleAnswerApproval(async ({ params, request }) => {
      const approval = find(params.id);
      if (approval === undefined) return notFound();
      const body = zAnswerApprovalRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'answer must be approve or reject');
      if (approval.status !== 'pending')
        return refusal(409, 'already_decided', 'this approval is already decided');
      if (body.data.shownDigest !== approval.shownDigest) {
        return refusal(409, 'shown_digest_mismatch', 'the approval changed since it was shown');
      }
      const approvers = db.approvers[approval.id] ?? [];
      if (!approvers.includes(me.dev.login))
        return refusal(403, 'not_an_approver', 'you cannot answer this approval');
      const refused =
        body.data.answer === 'approve' ? selfApprovalRefusal(approval, approvers, me.dev.login) : undefined;
      if (refused !== undefined) return refusal(403, 'self_approval_refused', refused);
      const at = now().toISOString();
      const selfApproved = body.data.answer === 'approve' && isAsker(approval, me.dev.login);
      const next = answered(approval, body.data.answer, selfApproved, at);
      db.approvals = db.approvals.map((item) => (item.id === next.id ? next : item));
      const receipt = receiptOf(next, at);
      db.receipts = [receipt, ...db.receipts];
      return HttpResponse.json({ approval: next, receipt });
    }),
    handleListSessions(({ request }) => {
      const open = new URL(request.url).searchParams.get('open');
      const items = db.sessions.filter((session) => open === null || (session.endedAt === undefined) === (open === 'true'));
      return HttpResponse.json({ items });
    }),
    handleGetSession(({ params }) => {
      const session = db.sessions.find((item) => item.id === params.id);
      if (session === undefined) return refusal(404, 'not_found', 'session not found');
      const receipt = db.receipts.find((item) => item.id === session.receiptId);
      return HttpResponse.json(receipt === undefined ? { session } : { session, receipt });
    }),
    handleListReceipts(({ request }) => {
      const query = new URL(request.url).searchParams;
      const kind = query.get('subjectKind');
      const id = query.get('subjectId');
      const items = db.receipts.filter(
        (receipt) => (kind === null || receipt.subject.kind === kind) && (id === null || receipt.subject.id === id),
      );
      return HttpResponse.json({ items });
    }),
    handleGetReceipt(({ params }) => {
      const receipt = findReceipt(params.id);
      return receipt === undefined ? receiptNotFound() : HttpResponse.json(receipt);
    }),
    handleVerifyReceipt(({ params }) => {
      const receipt = findReceipt(params.id);
      if (receipt === undefined) return receiptNotFound();
      const ok = receipt.signature.includes(`kid=${MOCK_KEY.kid}`);
      return HttpResponse.json(
        ok
          ? { ok, digest: receipt.subject.digest, kid: MOCK_KEY.kid }
          : { ok, reason: 'the signature does not match any key of this instance' },
      );
    }),
    handleGetReceiptBundle(({ params }) => {
      const receipt = findReceipt(params.id);
      if (receipt === undefined) return receiptNotFound();
      return HttpResponse.json({
        format: 'ostrom-receipt-bundle/1',
        receipt,
        chain: [],
        package: null,
        keys: [MOCK_KEY],
        exportedAt: now().toISOString(),
      });
    }),
  ];
}
