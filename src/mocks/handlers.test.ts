// SPDX-License-Identifier: AGPL-3.0-only
import { answerApproval, getApproval, getMe, listApprovals } from '@gen/api/sdk.gen';
import type { Approval } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';
import { initialApprovals } from '@/mocks/fixtures/approvals';
import { createHandlers, createMockDb, selfApprovalRefusal } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();
const NOW = new Date('2026-10-30T08:00:00.000Z');

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test', getToken: () => undefined });
});
afterEach(() => {
  server.resetHandlers();
  const fresh = createMockDb();
  db.approvals = fresh.approvals;
  db.approvers = fresh.approvers;
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

function fixture(id: string): Approval {
  const found = initialApprovals().find((approval) => approval.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

const merge = { path: { id: 'apr-merge-412' } };
const deploy = { path: { id: 'apr-deploy-88' } };

describe('mock API', () => {
  it('says who is signed in', async () => {
    const { data } = await getMe({ throwOnError: true });
    expect(data.dev.login).toBe('maya');
  });

  it('lists what waits for the caller, by status, or everything', async () => {
    const mine = await listApprovals({ query: { mine: true }, throwOnError: true });
    const approved = await listApprovals({ query: { status: 'approved' }, throwOnError: true });
    const all = await listApprovals({ throwOnError: true });
    expect(mine.data.items.map((approval) => approval.id)).toEqual(['apr-merge-412', 'apr-deploy-88']);
    expect(approved.data.items.map((approval) => approval.id)).toEqual(['apr-migration-7']);
    expect(all.data.items).toHaveLength(3);
  });

  it('leaves out of "mine" what the caller cannot answer', async () => {
    db.approvers['apr-deploy-88'] = ['samir'];
    const mine = await listApprovals({ query: { mine: true }, throwOnError: true });
    expect(mine.data.items.map((approval) => approval.id)).toEqual(['apr-merge-412']);
  });

  it('returns one approval, or 404', async () => {
    const { data } = await getApproval({ ...merge, throwOnError: true });
    expect(data.title).toBe('Merge PR #412 into main');
    const error = await failureOf(async () => getApproval({ path: { id: 'nope' }, throwOnError: true }));
    expect(isApiFailure(error) && [error.status, error.code]).toEqual([404, 'not_found']);
  });

  it('approves as the caller, signs a receipt, and moves the approval out of the queue', async () => {
    const { data } = await answerApproval({
      ...merge,
      body: { answer: 'approve', shownDigest: 'sha256:5b0c2f8e' },
      throwOnError: true,
    });
    expect([data.approval.status, data.approval.decidedBy]).toEqual(['approved', 'maya']);
    expect(data.receipt?.decisions[0]).toMatchObject({ approvalId: 'apr-merge-412', by: 'maya', result: 'approved' });
    expect(data.receipt?.subject.digest).toBe('sha256:5b0c2f8e');
    const mine = await listApprovals({ query: { mine: true }, throwOnError: true });
    expect(mine.data.items.map((approval) => approval.id)).toEqual(['apr-deploy-88']);
  });

  it('stamps the answer with the injected clock', async () => {
    server.use(...createHandlers(db, () => NOW));
    const { data } = await answerApproval({
      ...merge,
      body: { answer: 'reject', shownDigest: 'sha256:5b0c2f8e', comment: 'Wait for the migration.' },
      throwOnError: true,
    });
    expect([data.approval.status, data.approval.decidedAt]).toEqual(['rejected', NOW.toISOString()]);
  });

  it('refuses the asker’s own approval while another approver exists, and lets their refusal through', async () => {
    const error = await failureOf(async () =>
      answerApproval({ ...deploy, body: { answer: 'approve', shownDigest: 'sha256:a91d0e44' }, throwOnError: true }),
    );
    expect(isApiFailure(error) && [error.status, error.code, error.message]).toEqual([
      403,
      'self_approval_refused',
      'You asked for this: samir has to approve it.',
    ]);
    const { data } = await answerApproval({
      ...deploy,
      body: { answer: 'reject', shownDigest: 'sha256:a91d0e44' },
      throwOnError: true,
    });
    expect(data.approval.status).toBe('rejected');
  });

  it('marks the approval of the only approver as self-approved, on the approval and its receipt', async () => {
    db.approvers['apr-deploy-88'] = ['maya'];
    const { data } = await answerApproval({
      ...deploy,
      body: { answer: 'approve', shownDigest: 'sha256:a91d0e44' },
      throwOnError: true,
    });
    expect([data.approval.selfApproved, data.receipt?.decisions[0]?.selfApproved]).toEqual([true, true]);
  });

  it('refuses someone who is not an approver', async () => {
    db.approvers['apr-merge-412'] = ['samir'];
    const error = await failureOf(async () =>
      answerApproval({ ...merge, body: { answer: 'approve', shownDigest: 'sha256:5b0c2f8e' }, throwOnError: true }),
    );
    expect(isApiFailure(error) && error.code).toBe('not_an_approver');
  });

  it('answers 409 when what was shown changed, or when the approval is already decided', async () => {
    const changed = await failureOf(async () =>
      answerApproval({ ...merge, body: { answer: 'approve', shownDigest: 'sha256:old' }, throwOnError: true }),
    );
    const decided = await failureOf(async () =>
      answerApproval({
        path: { id: 'apr-migration-7' },
        body: { answer: 'reject', shownDigest: 'sha256:0c77aa19' },
        throwOnError: true,
      }),
    );
    expect(isApiFailure(changed) && [changed.kind, changed.code]).toEqual(['conflict', 'shown_digest_mismatch']);
    expect(isApiFailure(decided) && decided.code).toBe('already_decided');
  });

  it('handles an approval nobody was named for, and one without an asker', async () => {
    const orphan: Approval = { ...fixture('apr-merge-412'), id: 'apr-orphan' };
    delete orphan.askedBy;
    db.approvals.push(orphan);
    const mine = await listApprovals({ query: { mine: true }, throwOnError: true });
    expect(mine.data.items.map((approval) => approval.id)).not.toContain('apr-orphan');
    const refused = await failureOf(async () =>
      answerApproval({
        path: { id: 'apr-orphan' },
        body: { answer: 'approve', shownDigest: 'sha256:5b0c2f8e' },
        throwOnError: true,
      }),
    );
    expect(isApiFailure(refused) && refused.code).toBe('not_an_approver');

    db.approvers['apr-orphan'] = ['maya'];
    const { data } = await answerApproval({
      path: { id: 'apr-orphan' },
      body: { answer: 'approve', shownDigest: 'sha256:5b0c2f8e' },
      throwOnError: true,
    });
    expect([data.receipt?.initiator, data.approval.selfApproved]).toEqual(['maya', undefined]);
  });

  it('answers 404 to an unknown approval and 400 to a body that is not an answer', async () => {
    const missing = await failureOf(async () =>
      answerApproval({ path: { id: 'nope' }, body: { answer: 'approve', shownDigest: 'x' }, throwOnError: true }),
    );
    const notJson = await fetch('http://ostrom.test/api/v1/approvals/apr-merge-412/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(isApiFailure(missing) && missing.status).toBe(404);
    expect(notJson.status).toBe(400);
  });
});

describe('selfApprovalRefusal', () => {
  it('lets through someone who did not ask', () => {
    expect(selfApprovalRefusal(fixture('apr-merge-412'), ['maya', 'samir'], 'maya')).toBeUndefined();
  });

  it('refuses the asker, case-insensitively, and names the other approvers', () => {
    expect(selfApprovalRefusal(fixture('apr-deploy-88'), ['maya', 'samir', 'lena'], 'MAYA')).toBe(
      'You asked for this: samir or lena has to approve it.',
    );
  });

  it('lets the asker through as the only approver, and treats a missing asker list as nobody', () => {
    expect(selfApprovalRefusal(fixture('apr-deploy-88'), ['maya'], 'maya')).toBeUndefined();
    const anonymous = fixture('apr-deploy-88');
    delete anonymous.askedBy;
    expect(selfApprovalRefusal(anonymous, ['maya'], 'maya')).toBeUndefined();
  });
});
