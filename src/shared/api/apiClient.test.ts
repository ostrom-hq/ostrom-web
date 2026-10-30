import { client } from '@gen/api/client.gen';
import { handleGetMe } from '@gen/api/msw.gen';
import { getApproval, getMe, logout } from '@gen/api/sdk.gen';
import type { Me } from '@gen/api/types.gen';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { apiUrl, configureApiClient } from '@/shared/api/apiClient';

const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };
const notFound = { error: { type: 'not_found', message: 'approval not found' } };

const server = setupServer(
  handleGetMe({ body: me }),
  http.get('*/api/v1/approvals/:id', () => HttpResponse.json(notFound, { status: 404 })),
);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

async function failureOf(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('the call did not fail');
}

describe('generated client, configured', () => {
  it('installs the failure mapping once, however often it is configured', () => {
    configureApiClient({ baseUrl: 'http://ostrom.test' });
    expect(client.interceptors.error.fns.filter((fn) => fn !== null)).toHaveLength(1);
  });

  it('returns data that passed the contract', async () => {
    const { data } = await getMe({ throwOnError: true });
    expect(data).toEqual(me);
  });

  it('sends no bearer token: the cookie is the session', async () => {
    let seen: string | null = 'unset';
    server.use(
      http.get('*/api/v1/auth/me', ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json(me);
      }),
    );
    await getMe({ throwOnError: true });
    expect(seen).toBeNull();
  });

  it('sends the session cookie with every call (S2-08)', async () => {
    let credentials: RequestCredentials | undefined;
    const capture = (request: Request): Request => {
      credentials = request.credentials;
      return request;
    };
    client.interceptors.request.use(capture);
    try {
      await getMe({ throwOnError: true });
    } finally {
      client.interceptors.request.eject(capture);
    }
    expect(credentials).toBe('include');
  });

  it('sends the CSRF cookie back in a header on a call that changes something', async () => {
    document.cookie = 'ostrom_csrf=tok-1; path=/';
    let seen: string | null = null;
    server.use(
      http.post('*/api/v1/auth/logout', ({ request }) => {
        seen = request.headers.get('x-csrf-token');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    try {
      await logout({ throwOnError: true });
    } finally {
      document.cookie = 'ostrom_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    }
    expect(seen).toBe('tok-1');
    configureApiClient({ baseUrl: 'http://ostrom.test' });
    expect(client.interceptors.request.fns.filter((fn) => fn !== null)).toHaveLength(1);
  });

  it('builds an API address the browser opens itself', () => {
    expect(apiUrl('/api/v1/auth/github/start')).toBe('http://ostrom.test/api/v1/auth/github/start');
    expect(apiUrl('/api/v1/auth/github/start', { redirect: '/yes?x=1' })).toBe(
      'http://ostrom.test/api/v1/auth/github/start?redirect=%2Fyes%3Fx%3D1',
    );
  });

  it('turns an answer outside the contract into an invalid-response failure', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ dev: { login: 'maya' }, capabilities: 'nope' })),
    );
    const error = await failureOf(async () => getMe({ throwOnError: true }));
    expect(isApiFailure(error) && error.kind).toBe('invalid-response');
  });

  it('turns a 404 into a not-found failure with the server message', async () => {
    const error = await failureOf(async () => getApproval({ path: { id: 'missing' }, throwOnError: true }));
    expect(isApiFailure(error) && [error.kind, error.message]).toEqual(['not-found', 'approval not found']);
  });

  it('turns a dropped connection into a network failure', async () => {
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.error()));
    const error = await failureOf(async () => getMe({ throwOnError: true }));
    expect(isApiFailure(error) && error.kind).toBe('network');
  });
});
