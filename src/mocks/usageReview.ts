// SPDX-License-Identifier: Apache-2.0
import {
  handleGetUsageReview,
  handleListPendingUsage,
  handleListUsageReconciliations,
  handleReconcileUsage,
} from '@gen/api/msw.gen';
import type { PendingUsage, UsageReconciliation } from '@gen/api/types.gen';
import { zReconcileUsageBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface UsageReviewState {
  /** The holds whose usage is unknown, newest first. */
  pendingUsage: PendingUsage[];
  /** The corrections made, newest first. */
  usageReconciliations: UsageReconciliation[];
}

/** Two holds a stream cut left unknown, and one corrected, in the demo organization. */
export function initialUsageReview(): UsageReviewState {
  return {
    pendingUsage: [
      {
        id: 'call_7f3a9c',
        member: 'theo',
        micros: 1_250_000,
        heldAt: '2026-11-14T16:02:00Z',
        leaseExpiredAt: '2026-11-14T16:12:00Z',
        workflowId: 'wf_release',
      },
      {
        id: 'call_51b2e0',
        member: 'samir',
        micros: 480_500,
        heldAt: '2026-11-13T09:40:00Z',
        leaseExpiredAt: '2026-11-13T09:50:00Z',
        providerRequestId: 'req_011CXa',
      },
    ],
    usageReconciliations: [
      {
        id: 'call_2c4d6e',
        member: 'theo',
        heldAt: '2026-11-12T11:00:00Z',
        previousMicros: 2_000_000,
        micros: 310_000,
        source: 'PROVIDER_RECORD',
        reference: 'console usage export 2026-11-12',
        reason: 'stream cut after the first tokens',
        reconciledBy: 'lena',
        reconciledAt: '2026-11-13T08:00:00Z',
      },
    ],
  };
}

const PAGE = 50;

/** A keyset page as the server answers it: 50 at most, `next` the `before` of the following page. */
function pageOf<T extends { readonly id: string; readonly member: string }>(
  items: readonly T[],
  request: Request,
  loginOf: (request: Request, id: string) => string | undefined,
): { items: T[]; next?: string } {
  const params = new URL(request.url).searchParams;
  const member = params.get('member');
  const login = member === null ? undefined : (loginOf(request, member) ?? '');
  const mine = items.filter((item) => login === undefined || item.member === login);
  const before = params.get('before');
  const start = before === null ? 0 : mine.findIndex((item) => item.id === before) + 1;
  const page = mine.slice(start, start + PAGE);
  const next = mine.length > start + PAGE ? mine[start + PAGE - 1] : undefined;
  return { items: page, ...(next === undefined ? {} : { next: next.id }) };
}

/**
 * The usage review, as ostrom-server serves it: owners and admins read and correct (anyone else, 403); the correction
 * needs a sign-in less than five minutes old (403 `step_up_required`), the charge and provider request id shown (else
 * 409 `stale_reconciliation`), and happens once: the same one again answers the record, another 409 `reconciled`.
 */
export function createUsageReviewHandlers(
  state: () => UsageReviewState,
  access: {
    readonly manages: (request: Request) => boolean;
    readonly stale: () => boolean;
    readonly loginOf: (request: Request, id: string) => string | undefined;
    readonly me: () => string;
  },
  now: () => Date,
): HttpHandler[] {
  const forbidden = () => refusal(403, 'forbidden', 'Only owners and admins review usage.');
  const notFound = () => refusal(404, 'not_found', 'No usage review with this id.');
  return [
    handleListPendingUsage(({ request }) =>
      access.manages(request)
        ? HttpResponse.json(pageOf(state().pendingUsage, request, access.loginOf))
        : forbidden(),
    ),
    handleListUsageReconciliations(({ request }) =>
      access.manages(request)
        ? HttpResponse.json(pageOf(state().usageReconciliations, request, access.loginOf))
        : forbidden(),
    ),
    handleGetUsageReview(({ request, params }) => {
      if (!access.manages(request)) return forbidden();
      const pending = state().pendingUsage.find((item) => item.id === params.id);
      if (pending !== undefined) return HttpResponse.json({ pending });
      const reconciliation = state().usageReconciliations.find((item) => item.id === params.id);
      return reconciliation === undefined ? notFound() : HttpResponse.json({ reconciliation });
    }),
    handleReconcileUsage(async ({ request, params }) => {
      if (!access.manages(request)) return forbidden();
      if (access.stale())
        return refusal(403, 'step_up_required', 'A correction needs a sign-in less than five minutes old.');
      const body = zReconcileUsageBody.safeParse(await readJson(request));
      if (!body.success || [body.data.reference, body.data.reason].some((text) => /[\r\n]/.test(text)))
        return refusal(
          400,
          'invalid_reconciliation',
          'micros 0 to 100000000000000, a source, one-line texts.',
        );
      const sent = body.data;
      const done = state().usageReconciliations.find((item) => item.id === params.id);
      if (done !== undefined) {
        const same =
          JSON.stringify([done.micros, done.source, done.reference, done.reason]) ===
          JSON.stringify([sent.micros, sent.source, sent.reference.trim(), sent.reason.trim()]);
        return same
          ? HttpResponse.json(done)
          : refusal(409, 'reconciled', 'This request was already reconciled.');
      }
      const pending = state().pendingUsage.find((item) => item.id === params.id);
      if (pending === undefined) return notFound();
      if (
        sent.expectedMicros !== pending.micros ||
        sent.expectedProviderRequestId !== pending.providerRequestId
      )
        return refusal(
          409,
          'stale_reconciliation',
          'The request changed since it was shown: review it again.',
        );
      const record: UsageReconciliation = {
        id: pending.id,
        member: pending.member,
        ...(pending.workflowId === undefined ? {} : { workflowId: pending.workflowId }),
        ...(pending.launchId === undefined ? {} : { launchId: pending.launchId }),
        ...(pending.providerRequestId === undefined ? {} : { providerRequestId: pending.providerRequestId }),
        heldAt: pending.heldAt,
        previousMicros: pending.micros,
        micros: sent.micros,
        source: sent.source,
        reference: sent.reference.trim(),
        reason: sent.reason.trim(),
        reconciledBy: access.me(),
        reconciledAt: now().toISOString(),
      };
      state().pendingUsage = state().pendingUsage.filter((item) => item.id !== pending.id);
      state().usageReconciliations = [record, ...state().usageReconciliations];
      return HttpResponse.json(record);
    }),
  ];
}
