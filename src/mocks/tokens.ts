// SPDX-License-Identifier: AGPL-3.0-only
import { handleCreateToken, handleListTokens, handleRevokeToken, handleRotateToken } from '@gen/api/msw.gen';
import type { ApiError, CreatedToken, Token } from '@gen/api/types.gen';
import { zTokenCreate } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';

export interface TokensState {
  /** The person's live tokens, newest first; never their secret. */
  tokens: Token[];
  /** The next token number; numbers are never reused, even after a revocation. */
  nextToken: number;
}

/** The server's `SCOPE_PATTERN`: `resource:action`, lowercase. */
const SCOPE = /^[a-z][a-z0-9-]{0,31}:[a-z][a-z0-9-]{0,31}$/;
/** What no personal token ever carries (`NEVER_ON_A_TOKEN`): a token never says yes nor acts as a session. */
const NEVER_ON_A_TOKEN = new Set(['gates:answer', 'agent:session', 'user:*']);
const MAX_SCOPES = 32;
const DAY_MS = 86_400_000;

function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** A secret the demo can show once: never one the real server would take. */
function secretOf(number: number): string {
  return `osp_demo${String(number).padStart(4, '0')}mockmockmockmockmock`;
}

export function createTokensHandlers(state: () => TokensState, now: () => Date): HttpHandler[] {
  const issue = (base: Omit<Token, 'id' | 'hint' | 'createdAt' | 'lastUsedAt'>): CreatedToken => {
    const s = state();
    const number = s.nextToken;
    s.nextToken += 1;
    const secret = secretOf(number);
    const token: Token = {
      ...base,
      id: `tok-${String(number)}`,
      hint: secret.slice(0, 8),
      createdAt: now().toISOString(),
      lastUsedAt: null,
    };
    s.tokens = [token, ...s.tokens];
    return { token, secret };
  };
  const notFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'token not found');
  return [
    handleListTokens(() => HttpResponse.json({ tokens: state().tokens })),
    handleCreateToken(async ({ request }) => {
      const body = zTokenCreate.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a name and scopes are needed');
      const name = body.data.name.trim();
      if (name === '' || name.length > 100)
        return refusal(400, 'invalid_request', 'The name must be 1 to 100 characters.');
      const scopes = [...new Set(body.data.scopes)];
      if (
        scopes.length === 0 ||
        scopes.length > MAX_SCOPES ||
        scopes.some((scope) => !SCOPE.test(scope) || NEVER_ON_A_TOKEN.has(scope))
      )
        return refusal(400, 'invalid_request', 'Scopes must be 1 to 32 distinct resource:action values.');
      const days = body.data.expiresInDays ?? null;
      if (days !== null && (days < 1 || days > 366))
        return refusal(400, 'invalid_request', 'A token lasts 1 to 366 days, or has no expiry.');
      const expiresAt = days === null ? null : new Date(now().getTime() + days * DAY_MS).toISOString();
      return HttpResponse.json(issue({ name, kind: 'personal', scopes, expiresAt }), { status: 201 });
    }),
    handleRevokeToken(({ params }) => {
      const s = state();
      if (!s.tokens.some((token) => token.id === params.id)) return notFound();
      s.tokens = s.tokens.filter((token) => token.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    // The old secret stops working: the token is replaced by a new one, with the same name, scopes and expiry.
    handleRotateToken(({ params }) => {
      const s = state();
      const old = s.tokens.find((token) => token.id === params.id);
      if (old === undefined) return notFound();
      s.tokens = s.tokens.filter((token) => token !== old);
      const { name, kind, scopes, expiresAt } = old;
      return HttpResponse.json(issue({ name, kind, scopes, expiresAt }), { status: 201 });
    }),
  ];
}
