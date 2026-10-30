import { client } from '@gen/api/client.gen';
import { handleGetMe } from '@gen/api/msw.gen';
import { getApproval, getMe } from '@gen/api/sdk.gen';
import type { Me } from '@gen/api/types.gen';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };
const notFound = { error: { type: 'not_found', message: 'approval not found' } };

const server = setupServer(
  handleGetMe({ body: me }),
  http.get('*/api/v1/approvals/:id', () => HttpResponse.json(notFound, { status: 404 })),
);
let token: string | undefined;

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test', getToken: () => token });
});
afterEach(() => {
  server.resetHandlers();
  token = undefined;
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
    configureApiClient({ baseUrl: 'http://ostrom.test', getToken: () => token });
    expect(client.interceptors.error.fns.filter((fn) => fn !== null)).toHaveLength(1);
  });

  it('returns data that passed the contract', async () => {
    const { data } = await getMe({ throwOnError: true });
    expect(data).toEqual(me);
  });

  it('sends the viewer token as a bearer', async () => {
    token = 'opk_abcdef123456';
    let seen: string | null = null;
    server.use(
      http.get('*/api/v1/auth/me', ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json(me);
      }),
    );
    await getMe({ throwOnError: true });
    expect(seen).toBe('Bearer opk_abcdef123456');
  });

  it('turns an answer outside the contract into an invalid-response failure', async () => {
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({ dev: { login: 'maya' }, capabilities: 'nope' })));
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
