import type { Ask, Decision, Error as ApiError, SelfApprovalRefused, YesQueue } from '@gen/api/types.gen';
import { handleDecideAsk, handleGetAsk, handleGetYesQueue } from '@gen/api/msw.gen';
import { zDecideRequest } from '@gen/api/zod.gen';
import { HttpResponse, type HttpHandler } from 'msw';
import { initialAsks, viewer } from '@/mocks/fixtures/yes';

const RECENT_LIMIT = 8;

/** In-memory stand-in for the server: the same rules the prototype applies, so screens see real behaviour. */
export interface MockDb {
  asks: Ask[];
}

export function createMockDb(): MockDb {
  return { asks: initialAsks() };
}

function notFound(): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: 'request not found' }, { status: 404 });
}

function decide(ask: Ask, result: Decision, at: string): Ask {
  return {
    ...ask,
    status: result,
    decidedBy: viewer.login,
    decidedAt: at,
    receipt: {
      id: `rcpt-${ask.id}`,
      kind: 'gate',
      signature: `ed25519;kid=4f2a9c1b;sha256=${ask.shownDigest};sig=mock`,
      createdAt: at,
      valid: true,
      digest: ask.shownDigest,
      by: viewer.login,
      result,
    },
  };
}

/** The prototype's rule: the author of a request cannot say yes while someone else can (a no always passes). */
export function selfApprovalRefusal(ask: Ask): SelfApprovalRefused | undefined {
  if (ask.you === undefined || ask.you.canApprove) return undefined;
  const others = (ask.gate?.approvers ?? []).filter((login) => !ask.askedBy.includes(login));
  return {
    error: ask.you.reason ?? 'You asked for this action: another approver has to say yes.',
    code: 'self_approval_refused',
    others,
  };
}

export function createHandlers(db: MockDb, now: () => Date = () => new Date()): HttpHandler[] {
  const options = { baseUrl: '*/api' };
  return [
    handleGetYesQueue(
      () =>
        HttpResponse.json<YesQueue>({
          operator: viewer.login,
          you: viewer,
          pending: db.asks.filter((ask) => ask.status === 'pending'),
          recent: db.asks.filter((ask) => ask.status !== 'pending').slice(0, RECENT_LIMIT),
        }),
      options,
    ),
    handleGetAsk(({ params }) => {
      const ask = db.asks.find((candidate) => candidate.id === params.id);
      return ask === undefined ? notFound() : HttpResponse.json<Ask>(ask);
    }, options),
    handleDecideAsk(async ({ params, request }) => {
      const index = db.asks.findIndex((candidate) => candidate.id === params.id);
      const ask = db.asks[index];
      if (ask === undefined) return notFound();
      const body = zDecideRequest.safeParse(await request.json());
      if (!body.success) {
        return HttpResponse.json<ApiError>({ error: 'result must be approved or rejected' }, { status: 400 });
      }
      const refusal = body.data.result === 'approved' ? selfApprovalRefusal(ask) : undefined;
      if (refusal !== undefined) return HttpResponse.json<SelfApprovalRefused>(refusal, { status: 403 });
      const decided = decide(ask, body.data.result, now().toISOString());
      db.asks[index] = decided;
      return HttpResponse.json<Ask>(decided);
    }, options),
  ];
}
