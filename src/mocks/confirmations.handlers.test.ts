// SPDX-License-Identifier: AGPL-3.0-only
import { answerGovernanceConfirmation, getGovernanceConfirmation } from '@gen/api/sdk.gen';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { FRESH_SIGN_IN_MS, resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';
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

async function refusalOf(call: () => Promise<unknown>): Promise<ApiFailure> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return error;
    throw error;
  }
  throw new Error('the call was not refused');
}

const read = async (id: string) =>
  (await getGovernanceConfirmation({ path: { id }, throwOnError: true })).data;
const answer = async (id: string, value: 'confirm' | 'refuse') =>
  answerGovernanceConfirmation({ path: { id }, body: { answer: value }, throwOnError: true });

describe('the mock governance confirmations, as ostrom-server keeps them', () => {
  it('reads a confirmation, a pending one past its time as expired', async () => {
    expect(await read('gc-self-approval')).toMatchObject({ status: 'pending', kind: 'gates.policy' });
    expect(await read('gc-rule-gone')).toMatchObject({ status: 'expired' });
    expect(db.confirmations.find((item) => item.id === 'gc-rule-gone')?.status).toBe('expired');
    expect((await refusalOf(async () => read('gc-none'))).status).toBe(404);
  });

  it('confirms what it shows, as the confirmer, with what the write returned', async () => {
    const { data } = await answer('gc-self-approval', 'confirm');
    expect(data).toMatchObject({
      status: 'confirmed',
      answeredBy: { login: 'maya' },
      result: { selfApproval: 'never' },
    });
    // A deletion returns nothing.
    const dropped = await answer('gc-workflow-drop', 'confirm');
    expect(dropped.data.status).toBe('confirmed');
    expect(dropped.data.result).toBeUndefined();
    expect((await refusalOf(async () => answer('gc-self-approval', 'refuse'))).code).toBe(
      'confirmation_closed',
    );
  });

  it('refuses without a fresh sign-in, and confirms only with one', async () => {
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1_000;
    expect((await refusalOf(async () => answer('gc-self-approval', 'confirm'))).code).toBe(
      'step_up_required',
    );
    expect((await answer('gc-self-approval', 'refuse')).data).toMatchObject({ status: 'refused' });
  });

  it('writes nothing for a stale change or a write refused, and closes the confirmation as failed', async () => {
    const stale = await refusalOf(async () => answer('gc-models-stale', 'confirm'));
    expect([stale.status, stale.code]).toEqual([409, 'confirmation_stale']);
    expect(await read('gc-models-stale')).toMatchObject({
      status: 'failed',
      error: { type: 'confirmation_stale' },
    });
    const conflict = await refusalOf(async () => answer('gc-rules-bulk', 'confirm'));
    expect([conflict.status, conflict.code]).toEqual([409, 'version_conflict']);
    expect((await read('gc-rules-bulk')).status).toBe('failed');
  });

  it('answers an expired one with 410, a bad answer with 400, and nobody but owners and admins', async () => {
    expect((await refusalOf(async () => answer('gc-rule-gone', 'refuse'))).status).toBe(410);
    const bad = await fetch('http://ostrom.test/api/v1/confirmations/gc-rule-new/answer', {
      method: 'POST',
      body: '{"answer":"maybe"}',
    });
    expect(bad.status).toBe(400);
    expect((await refusalOf(async () => answer('gc-none', 'refuse'))).status).toBe(404);
    setDemoRole(db, 'member');
    expect((await refusalOf(async () => answer('gc-rule-new', 'refuse'))).code).toBe('forbidden');
  });

  it('shows another organization none of them', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    const headers = { 'Ostrom-Org': globex.id };
    const read = await refusalOf(async () =>
      getGovernanceConfirmation({ path: { id: 'gc-self-approval' }, headers, throwOnError: true }),
    );
    expect(read.status).toBe(404);
    const answered = await refusalOf(async () =>
      answerGovernanceConfirmation({
        path: { id: 'gc-self-approval' },
        headers,
        body: { answer: 'refuse' },
        throwOnError: true,
      }),
    );
    expect(answered.status).toBe(404);
  });
});
