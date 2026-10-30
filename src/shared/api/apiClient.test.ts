import { handleGetYesQueue } from '@gen/api/msw.gen';
import { getAsk, getYesQueue } from '@gen/api/sdk.gen';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const server = setupServer(
  handleGetYesQueue({ body: { operator: 'maya', pending: [], recent: [] } }, { baseUrl: '*/api' }),
  http.get('*/api/yes/:id', () => HttpResponse.json({ error: 'request not found' }, { status: 404 })),
);
let token: string | undefined;

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test/api', getToken: () => token });
  configureApiClient({ baseUrl: 'http://ostrom.test/api', getToken: () => token });
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
  it('returns data that passed the contract', async () => {
    const { data } = await getYesQueue({ throwOnError: true });
    expect(data).toEqual({ operator: 'maya', pending: [], recent: [] });
  });

  it('sends the viewer token as a bearer', async () => {
    token = 'opk_abcdef123456';
    let seen: string | null = null;
    server.use(
      http.get('*/api/yes/queue', ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ operator: 'maya', pending: [], recent: [] });
      }),
    );
    await getYesQueue({ throwOnError: true });
    expect(seen).toBe('Bearer opk_abcdef123456');
  });

  it('turns an answer outside the contract into an invalid-response failure', async () => {
    server.use(http.get('*/api/yes/queue', () => HttpResponse.json({ operator: 'maya', pending: 'nope' })));
    const error = await failureOf(() => getYesQueue({ throwOnError: true }));
    expect(isApiFailure(error) && error.kind).toBe('invalid-response');
  });

  it('turns a 404 into a not-found failure with the server message', async () => {
    const error = await failureOf(() => getAsk({ path: { id: 'missing' }, throwOnError: true }));
    expect(isApiFailure(error) && [error.kind, error.message]).toEqual(['not-found', 'request not found']);
  });

  it('turns a dropped connection into a network failure', async () => {
    server.use(http.get('*/api/yes/queue', () => HttpResponse.error()));
    const error = await failureOf(() => getYesQueue({ throwOnError: true }));
    expect(isApiFailure(error) && error.kind).toBe('network');
  });
});
