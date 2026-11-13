// SPDX-License-Identifier: Apache-2.0
import { zListAuditResponse } from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import { AUDIT_PAGE, type AuditState, createAuditHandlers } from '@/mocks/audit';
import { initialAudit } from '@/mocks/fixtures/audit';

const state: AuditState = { audit: initialAudit() };
let home = true;
let manager = true;
const handlers = createAuditHandlers(
  () => state,
  () => home,
  () => manager,
);

/** The handler's answer, without a socket. */
async function list(query = ''): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(handlers, new Request(`http://ostrom.test/api/v1/audit${query}`));
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

describe('the mock audit log', () => {
  afterEach(() => {
    state.audit = initialAudit();
    home = true;
    manager = true;
  });

  it('pages the log newest first, `next` read back as `before`, and the last page has none', async () => {
    const first = zListAuditResponse.parse((await list()).body);
    expect(first.items).toHaveLength(AUDIT_PAGE);
    expect(first.next).toBe('aud-03');
    const second = zListAuditResponse.parse((await list('?before=aud-03')).body);
    expect(second.items.map((event) => event.id)).toEqual(['aud-02', 'aud-01']);
    expect(second.next).toBeUndefined();
  });

  it('refuses a cursor no page gave', async () => {
    expect((await list('?before=nope')).status).toBe(400);
  });

  it('reads the log to an owner or an admin only, and never another organization’s', async () => {
    manager = false;
    expect((await list()).status).toBe(403);
    manager = true;
    home = false;
    expect(zListAuditResponse.parse((await list()).body).items).toEqual([]);
  });
});
