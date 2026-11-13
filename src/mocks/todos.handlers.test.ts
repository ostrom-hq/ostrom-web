// SPDX-License-Identifier: Apache-2.0
import { getSessionTodo, listTodoStopHooks, setMemberTodoStopHook } from '@gen/api/sdk.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function status(call: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return error.status;
    throw error;
  }
  throw new Error('the call did not fail');
}

describe('the session todo', () => {
  it('answers the list of a session, or null for one without', async () => {
    const { data } = await getSessionTodo({ query: { sessionId: 'ses-7f3a' }, throwOnError: true });
    expect(data.todo?.sessionId).toBe('ses-7f3a');
    const none = await getSessionTodo({ query: { sessionId: 'ses-51c0' }, throwOnError: true });
    expect(none.data).toEqual({ todo: null });
  });

  it('asks which session', async () => {
    expect(await status(async () => getSessionTodo({ throwOnError: true }))).toBe(400);
  });
});

describe('the Stop hook switch', () => {
  it('lists the members whose hook is off, and turns one off and on again', async () => {
    const empty = await listTodoStopHooks({ throwOnError: true });
    expect(empty.data.members).toEqual([]);
    const off = await setMemberTodoStopHook({
      path: { memberId: MEMBER_IDS.theo },
      body: { enabled: false },
      throwOnError: true,
    });
    expect(off.data).toEqual({ memberId: MEMBER_IDS.theo, enabled: false });
    expect((await listTodoStopHooks({ throwOnError: true })).data.members).toEqual([
      { memberId: MEMBER_IDS.theo, enabled: false },
    ]);
    // A second no changes nothing more, and a yes puts it back on.
    await setMemberTodoStopHook({ path: { memberId: MEMBER_IDS.theo }, body: { enabled: false } });
    await setMemberTodoStopHook({ path: { memberId: MEMBER_IDS.theo }, body: { enabled: true } });
    expect((await listTodoStopHooks({ throwOnError: true })).data.members).toEqual([]);
  });

  it('refuses a body without enabled, and a member the organization does not have', async () => {
    const sent = await fetch(`http://ostrom.test/api/v1/todos/stop-hook/members/${MEMBER_IDS.theo}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(sent.status).toBe(400);
    expect(
      await status(async () =>
        setMemberTodoStopHook({ path: { memberId: 'nobody' }, body: { enabled: false }, throwOnError: true }),
      ),
    ).toBe(404);
  });

  it('is for an owner or an admin', async () => {
    setDemoRole(db, 'member');
    expect(await status(async () => listTodoStopHooks({ throwOnError: true }))).toBe(403);
    expect(
      await status(async () =>
        setMemberTodoStopHook({
          path: { memberId: MEMBER_IDS.theo },
          body: { enabled: false },
          throwOnError: true,
        }),
      ),
    ).toBe(403);
  });
});
