// SPDX-License-Identifier: AGPL-3.0-only
import { growLarge, LARGE } from '@/mocks/fixtures/large';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { configureApiClient } from '@/shared/api/apiClient';
import { everyMember, MEMBERS_PAGE } from '@/shared/org/members';

const { server, db } = createMockServer();
const pages: URL[] = [];

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/members')) pages.push(url);
  });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
  pages.length = 0;
});
afterAll(() => {
  server.close();
});

describe('everyMember', () => {
  it('reads one page when the organization holds fewer members than a page', async () => {
    const { items } = await everyMember('acme', new AbortController().signal);
    expect(items.map((member) => member.login)).toEqual(['lena', 'maya', 'samir', 'theo', 'ines']);
    expect(pages.map((url) => url.search)).toEqual([`?limit=${String(MEMBERS_PAGE)}`]);
  });

  it('reads every page of a large organization, each after the previous one', async () => {
    growLarge(db);
    const { items } = await everyMember('acme', new AbortController().signal);
    expect(items).toHaveLength(5 + LARGE.members);
    expect(new Set(items.map((member) => member.id)).size).toBe(items.length);
    expect(pages).toHaveLength(Math.ceil((5 + LARGE.members) / MEMBERS_PAGE));
    expect(pages[1]?.searchParams.get('after')).toBe(items[MEMBERS_PAGE - 1]?.id);
  });

  it('fails as the server does', async () => {
    await expect(everyMember('nowhere', new AbortController().signal)).rejects.toBeDefined();
  });
});
