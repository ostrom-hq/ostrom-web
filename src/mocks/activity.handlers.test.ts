// SPDX-License-Identifier: Apache-2.0
import { zListActivityResponse } from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import { ACTIVITY_PAGE, type ActivityState, createActivityHandlers } from '@/mocks/activity';
import { initialActivity } from '@/mocks/fixtures/activity';

const state: ActivityState = { activity: initialActivity() };
let home = true;
const handlers = createActivityHandlers(
  () => state,
  () => home,
);

/** The handler's answer, without a socket. */
async function list(query = ''): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(handlers, new Request(`http://ostrom.test/api/v1/activity${query}`));
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

function page(body: unknown): ReturnType<typeof zListActivityResponse.parse> {
  return zListActivityResponse.parse(body);
}

describe('the mock activity feed', () => {
  afterEach(() => {
    state.activity = initialActivity();
    home = true;
  });

  it('shows another organization nothing of the demo’s activity', async () => {
    home = false;
    expect(page((await list()).body).items).toEqual([]);
  });

  it('pages newest first by key, and the last page has no next', async () => {
    const first = page((await list()).body);
    expect(first.items).toHaveLength(ACTIVITY_PAGE);
    expect(first.next).toBe(`${first.items[4]?.at ?? ''}~${first.items[4]?.id ?? ''}`);
    const second = page((await list(`?before=${encodeURIComponent(first.next ?? '')}`)).body);
    expect(second.items.map((item) => item.id)).toEqual(
      initialActivity()
        .slice(5)
        .map((item) => item.id),
    );
    expect(second.next).toBeUndefined();
  });

  it('orders two items of the same instant by id', async () => {
    const at = '2026-10-30T07:00:00.000Z';
    state.activity = [
      { id: 'b', at, kind: 'session.started', actor: { kind: 'agent', name: 'x' }, summary: 'b' },
      { id: 'a', at, kind: 'session.started', actor: { kind: 'agent', name: 'x' }, summary: 'a' },
    ];
    expect(
      page((await list(`?before=${encodeURIComponent(`${at}~b`)}`)).body).items.map((item) => item.id),
    ).toEqual(['a']);
  });

  it('keeps only one repository’s sessions', async () => {
    const { items } = page((await list('?repo=acme%2Fweb')).body);
    expect(items.map((item) => item.id)).toEqual(['session.ended:ses-2b9e', 'session.started:ses-2b9e']);
  });

  it('refuses a cursor no page gave', async () => {
    for (const before of ['nonsense', 'not-a-date~x', '2026~x', '2026-10-30T07:00:00.000Z~']) {
      expect(await list(`?before=${encodeURIComponent(before)}`)).toMatchObject({
        status: 400,
        body: { error: { type: 'invalid_request' } },
      });
    }
  });
});
