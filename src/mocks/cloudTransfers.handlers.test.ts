// SPDX-License-Identifier: Apache-2.0
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function call(method: string, path: string, body?: unknown): Promise<number> {
  const response = await fetch(`http://ostrom.test/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'Idempotency-Key': 'k' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response.status;
}

describe('the transfer handlers of the demo server', () => {
  it('refuses a transfer that is not an object with a recipient, a session it does not have, or a stranger', async () => {
    expect(await call('POST', '/cloud/sessions/cs-31/transfer', { resume: true })).toBe(400);
    expect(await call('POST', '/cloud/sessions/nope/transfer', { toMemberId: MEMBER_IDS.theo })).toBe(404);
    expect(await call('POST', '/cloud/sessions/cs-31/transfer', { toMemberId: MEMBER_IDS.ines })).toBe(422);
  });

  it('answers an unknown transfer with 404 and a closed one with 409', async () => {
    expect(await call('POST', '/cloud/transfers/nope/accept')).toBe(404);
    expect(await call('POST', '/cloud/transfers/tr-1/decline')).toBe(200);
    expect(await call('POST', '/cloud/transfers/tr-1/accept')).toBe(409);
  });
});
