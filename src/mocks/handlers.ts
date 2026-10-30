import type {
  Ask,
  DecideRequest,
  Error as ApiError,
  SelfApprovalRefused,
  YesQueue,
} from '@gen/api/types.gen';
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

function decide(ask: Ask, request: DecideRequest, at: string): Ask {
  const { result, note } = request;
  const selfApproved = result === 'approved' && ask.askedBy.includes(viewer.login);
  return {
    ...ask,
    ...(selfApproved ? { selfApproved } : {}),
    ...(note === undefined ? {} : { note }),
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
      ...(selfApproved ? { selfApproved } : {}),
    },
  };
}

/**
 * The prototype's rule (`selfCheck`): the author of a request cannot say yes while another approver exists;
 * as the only approver, the yes passes (marked self-approved). A no always passes.
 */
export function selfApprovalRefusal(ask: Ask, login: string): SelfApprovalRefused | undefined {
  const asked = new Set(ask.askedBy.map((author) => author.toLowerCase()));
  if (!asked.has(login.toLowerCase())) return undefined;
  const others = (ask.gate?.approvers ?? []).filter((approver) => !asked.has(approver.toLowerCase()));
  if (others.length === 0) return undefined;
  return {
    error: `You asked for this action: ${others.join(' or ')} has to approve it.`,
    code: 'self_approval_refused',
    others,
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
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
      if (ask.status !== 'pending') {
        return HttpResponse.json<ApiError>({ error: 'request already decided' }, { status: 409 });
      }
      const body = zDecideRequest.safeParse(await readJson(request));
      if (!body.success) {
        return HttpResponse.json<ApiError>({ error: 'result must be approved or rejected' }, { status: 400 });
      }
      const refusal = body.data.result === 'approved' ? selfApprovalRefusal(ask, viewer.login) : undefined;
      if (refusal !== undefined) return HttpResponse.json<SelfApprovalRefused>(refusal, { status: 403 });
      const decided = decide(ask, body.data, now().toISOString());
      db.asks[index] = decided;
      return HttpResponse.json<Ask>(decided);
    }, options),
  ];
}
