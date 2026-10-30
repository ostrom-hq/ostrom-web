// SPDX-License-Identifier: AGPL-3.0-only
import {
  answerApproval,
  bulkUpdateRules,
  createMcpServer,
  createSecret,
  deleteMcpServer,
  deleteSecret,
  getApproval,
  getGatePolicy,
  getMcpUsage,
  getMe,
  getOrganization,
  getReceipt,
  getReceiptBundle,
  getSession,
  getSpending,
  getWorkflow,
  inviteMembers,
  listApprovals,
  listBudgets,
  listDecisions,
  listMcpCalls,
  listMcpServers,
  listMembers,
  listReceipts,
  listRules,
  listSecrets,
  listSessions,
  listTeams,
  listWorkflows,
  rotateSecret,
  saveMcpServer,
  setBudget,
  setGatePolicy,
  updateMember,
  updateRule,
  verifyReceipt,
} from '@gen/api/sdk.gen';
import type { Approval } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';
import { initialApprovals } from '@/mocks/fixtures/approvals';
import { createHandlers, resetMockDb, selfApprovalRefusal } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();
const NOW = new Date('2026-10-30T08:00:00.000Z');

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test', getToken: () => undefined });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
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
    expect(data).toMatchObject({ dev: { login: 'maya' } });
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
    expect(data.receipt?.decisions[0]).toMatchObject({
      approvalId: 'apr-merge-412',
      by: 'maya',
      result: 'approved',
    });
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
      answerApproval({
        ...deploy,
        body: { answer: 'approve', shownDigest: 'sha256:a91d0e44' },
        throwOnError: true,
      }),
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
      answerApproval({
        ...merge,
        body: { answer: 'approve', shownDigest: 'sha256:5b0c2f8e' },
        throwOnError: true,
      }),
    );
    expect(isApiFailure(error) && error.code).toBe('not_an_approver');
  });

  it('answers 409 when what was shown changed, or when the approval is already decided', async () => {
    const changed = await failureOf(async () =>
      answerApproval({
        ...merge,
        body: { answer: 'approve', shownDigest: 'sha256:old' },
        throwOnError: true,
      }),
    );
    const decided = await failureOf(async () =>
      answerApproval({
        path: { id: 'apr-migration-7' },
        body: { answer: 'reject', shownDigest: 'sha256:0c77aa19' },
        throwOnError: true,
      }),
    );
    expect(isApiFailure(changed) && [changed.kind, changed.code]).toEqual([
      'conflict',
      'shown_digest_mismatch',
    ]);
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
      answerApproval({
        path: { id: 'nope' },
        body: { answer: 'approve', shownDigest: 'x' },
        throwOnError: true,
      }),
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

  it('refuses the asker even as the only approver when the policy says never', () => {
    expect(selfApprovalRefusal(fixture('apr-deploy-88'), ['maya'], 'maya', 'never')).toMatch(
      /never lets the asker/,
    );
    expect(selfApprovalRefusal(fixture('apr-merge-412'), ['maya'], 'maya', 'never')).toBeUndefined();
  });

  it('lets the asker through as the only approver, and treats a missing asker list as nobody', () => {
    expect(selfApprovalRefusal(fixture('apr-deploy-88'), ['maya'], 'maya')).toBeUndefined();
    const anonymous = fixture('apr-deploy-88');
    delete anonymous.askedBy;
    expect(selfApprovalRefusal(anonymous, ['maya'], 'maya')).toBeUndefined();
  });
});

describe('mock sessions', () => {
  it('lists open sessions, ended ones, or all', async () => {
    const open = await listSessions({ query: { open: true }, throwOnError: true });
    const ended = await listSessions({ query: { open: false }, throwOnError: true });
    const all = await listSessions({ throwOnError: true });
    expect(open.data.items.map((session) => session.id)).toEqual(['ses-7f3a', 'ses-51c0']);
    expect(ended.data.items.map((session) => session.id)).toEqual(['ses-2b9e']);
    expect(all.data.items).toHaveLength(3);
  });

  it('returns a session with its receipt once it has one, or 404', async () => {
    const ended = await getSession({ path: { id: 'ses-2b9e' }, throwOnError: true });
    const open = await getSession({ path: { id: 'ses-7f3a' }, throwOnError: true });
    expect(ended.data.receipt?.id).toBe('rcpt-ses-2b9e');
    expect(open.data).not.toHaveProperty('receipt');
    const error = await failureOf(async () => getSession({ path: { id: 'nope' }, throwOnError: true }));
    expect(isApiFailure(error) && error.message).toBe('session not found');
  });
});

describe('mock receipts', () => {
  it('lists receipts, by subject kind and id', async () => {
    const all = await listReceipts({ throwOnError: true });
    const gates = await listReceipts({ query: { subjectKind: 'gate' }, throwOnError: true });
    const one = await listReceipts({
      query: { subjectKind: 'session', subjectId: 'ses-2b9e' },
      throwOnError: true,
    });
    expect(all.data.items).toHaveLength(3);
    expect(gates.data.items.map((receipt) => receipt.id)).toEqual(['rcpt-apr-migration-7']);
    expect(one.data.items.map((receipt) => receipt.id)).toEqual(['rcpt-ses-2b9e']);
  });

  it('puts the receipt of an answer at the top', async () => {
    await answerApproval({
      ...merge,
      body: { answer: 'approve', shownDigest: 'sha256:5b0c2f8e' },
      throwOnError: true,
    });
    const { data } = await listReceipts({ throwOnError: true });
    expect(data.items[0]?.id).toBe('rcpt-apr-merge-412');
  });

  it('returns, verifies and bundles a receipt', async () => {
    const receipt = await getReceipt({ path: { id: 'rcpt-ses-2b9e' }, throwOnError: true });
    const good = await verifyReceipt({ path: { id: 'rcpt-ses-2b9e' }, throwOnError: true });
    const bad = await verifyReceipt({ path: { id: 'rcpt-tampered' }, throwOnError: true });
    const bundle = await getReceiptBundle({ path: { id: 'rcpt-ses-2b9e' }, throwOnError: true });
    expect(receipt.data.subject.kind).toBe('session');
    expect(good.data).toEqual({ ok: true, digest: 'sha256:7d01e5b2', kid: '4f2a9c1b' });
    expect(bad.data.ok).toBe(false);
    expect(bad.data.reason).toMatch(/does not match/);
    expect([bundle.data.receipt.id, bundle.data.keys[0]?.kid]).toEqual(['rcpt-ses-2b9e', '4f2a9c1b']);
  });

  const calls: readonly (readonly [string, (id: string) => Promise<unknown>])[] = [
    ['get', async (id) => getReceipt({ path: { id }, throwOnError: true })],
    ['verify', async (id) => verifyReceipt({ path: { id }, throwOnError: true })],
    ['bundle', async (id) => getReceiptBundle({ path: { id }, throwOnError: true })],
  ];

  it.each(calls)('answers 404 to %s an unknown receipt', async (_name, call) => {
    const error = await failureOf(async () => call('nope'));
    expect(isApiFailure(error) && error.message).toBe('receipt not found');
  });
});

describe('mock organization', () => {
  it('serves the organization, its members and its teams', async () => {
    const org = await getOrganization({ throwOnError: true });
    const members = await listMembers({ throwOnError: true });
    const teams = await listTeams({ throwOnError: true });
    expect(org.data.name).toBe('Acme');
    expect(members.data.items.map((member) => member.login)).toContain('samir');
    expect(teams.data.items.map((team) => team.slug)).toEqual(['billing', 'release']);
  });

  it('changes the role of a member, and refuses an unknown one, a bad role and the caller’s own', async () => {
    const { data } = await updateMember({
      path: { login: 'theo' },
      body: { role: 'approver' },
      throwOnError: true,
    });
    expect(data.role).toBe('approver');
    const missing = await failureOf(async () =>
      updateMember({ path: { login: 'nope' }, body: { role: 'member' }, throwOnError: true }),
    );
    const invited = await failureOf(async () =>
      updateMember({ path: { login: 'theo' }, body: { role: 'invited' }, throwOnError: true }),
    );
    const own = await failureOf(async () =>
      updateMember({ path: { login: 'maya' }, body: { role: 'member' }, throwOnError: true }),
    );
    expect(isApiFailure(missing) && missing.status).toBe(404);
    expect(isApiFailure(invited) && invited.status).toBe(400);
    expect(isApiFailure(own) && own.code).toBe('own_role');
  });

  it('invites new emails only, and refuses an invite without one', async () => {
    const { data } = await inviteMembers({
      body: { invites: [{ email: 'ana@acme.dev', role: 'member' }, { email: 'theo@acme.dev' }] },
      throwOnError: true,
    });
    expect(data.invited).toEqual(['ana@acme.dev']);
    const members = await listMembers({ throwOnError: true });
    expect(members.data.items.at(-1)).toMatchObject({ login: 'ana@acme.dev', role: 'invited' });
    const bad = await failureOf(async () =>
      inviteMembers({ body: { invites: [{ login: 'ana' }] }, throwOnError: true }),
    );
    expect(isApiFailure(bad) && bad.status).toBe(400);
  });

  it('lets only owners and admins manage members', async () => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    const role = await failureOf(async () =>
      updateMember({ path: { login: 'theo' }, body: { role: 'approver' }, throwOnError: true }),
    );
    const invite = await failureOf(async () =>
      inviteMembers({ body: { invites: [{ email: 'ana@acme.dev' }] }, throwOnError: true }),
    );
    expect(isApiFailure(role) && role.status).toBe(403);
    expect(isApiFailure(invite) && invite.status).toBe(403);
    db.members = db.members.filter((member) => member.login !== 'maya');
    const gone = await failureOf(async () =>
      inviteMembers({ body: { invites: [{ email: 'ana@acme.dev' }] }, throwOnError: true }),
    );
    expect(isApiFailure(gone) && gone.status).toBe(403);
  });

  it('lets an owner invite', async () => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'owner' } : member,
    );
    const { data } = await inviteMembers({
      body: { invites: [{ email: 'ana@acme.dev' }] },
      throwOnError: true,
    });
    expect(data.invited).toEqual(['ana@acme.dev']);
  });
});

describe('mock workflows and policy', () => {
  it('serves one workflow, or says it does not exist', async () => {
    expect((await getWorkflow({ path: { id: 'wf-backend' }, throwOnError: true })).data.name).toBe(
      'Backend changes',
    );
    const missing = await failureOf(async () => getWorkflow({ path: { id: 'nope' }, throwOnError: true }));
    expect(isApiFailure(missing) && missing.status).toBe(404);
  });

  it('lists workflows, by status', async () => {
    const all = await listWorkflows({ throwOnError: true });
    const proposed = await listWorkflows({ query: { status: 'proposed' }, throwOnError: true });
    expect(all.data.items).toHaveLength(2);
    expect(proposed.data.items.map((workflow) => workflow.id)).toEqual(['wf-migrations']);
  });

  it('reads and sets the self-approval policy, for owners and admins only', async () => {
    expect((await getGatePolicy({ throwOnError: true })).data.selfApproval).toBe('sole-approver');
    const set = await setGatePolicy({ body: { selfApproval: 'never' }, throwOnError: true });
    expect(set.data.selfApproval).toBe('never');
    const bad = await failureOf(async () =>
      setGatePolicy({ body: { selfApproval: 'always' }, throwOnError: true }),
    );
    expect(isApiFailure(bad) && bad.status).toBe(400);
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    const refused = await failureOf(async () =>
      setGatePolicy({ body: { selfApproval: 'never' }, throwOnError: true }),
    );
    expect(isApiFailure(refused) && refused.status).toBe(403);
  });
});

describe('mock rules and decisions', () => {
  it('lists rules by status and group', async () => {
    expect((await listRules({ throwOnError: true })).data.items).toHaveLength(4);
    const proposed = await listRules({ query: { status: 'proposed' }, throwOnError: true });
    expect(proposed.data.items.map((rule) => rule.id)).toEqual(['R-12', 'R-3']);
    const tests = await listRules({ query: { group: 'Tests' }, throwOnError: true });
    expect(tests.data.items.map((rule) => rule.id)).toEqual(['R-3']);
  });

  it('decides a rule, signs the decision, and reopens it', async () => {
    const accepted = await updateRule({
      path: { id: 'R-12' },
      body: { status: 'accepted' },
      throwOnError: true,
    });
    expect(accepted.data).toMatchObject({ status: 'accepted', decidedBy: 'maya' });
    expect(db.decisions[0]).toMatchObject({ subject: { kind: 'rule', id: 'R-12' }, action: 'accepted' });
    expect(db.receipts[0]?.id).toBe(db.decisions[0]?.receiptId);
    const reopened = await updateRule({
      path: { id: 'R-12' },
      body: { status: 'proposed' },
      throwOnError: true,
    });
    expect(reopened.data.status).toBe('proposed');
    expect(reopened.data.decidedBy).toBeUndefined();
  });

  it('marks an edited statement as edited, and keeps a strength change without a new decision', async () => {
    const before = db.decisions.length;
    const strength = await updateRule({
      path: { id: 'R-3' },
      body: { strength: 'required' },
      throwOnError: true,
    });
    expect(strength.data).toMatchObject({ strength: 'required', status: 'proposed' });
    expect(db.decisions).toHaveLength(before);
    const edited = await updateRule({
      path: { id: 'R-3' },
      body: { statement: 'Run `pnpm test` and `pnpm lint` before pushing.' },
      throwOnError: true,
    });
    expect(edited.data).toMatchObject({ status: 'edited', decidedBy: 'maya' });
    const again = await updateRule({
      path: { id: 'R-3' },
      body: { statement: 'Run the tests.' },
      throwOnError: true,
    });
    expect(again.data.status).toBe('edited');
    expect(db.decisions).toHaveLength(before + 2);
  });

  it('refuses an unknown rule, a bad change, and someone who does not decide', async () => {
    const missing = await failureOf(async () =>
      updateRule({ path: { id: 'R-0' }, body: {}, throwOnError: true }),
    );
    expect(isApiFailure(missing) && missing.status).toBe(404);
    const bad = await fetch('http://ostrom.test/api/v1/rules/R-3', {
      method: 'PATCH',
      body: '{"status":"maybe"}',
    });
    expect(bad.status).toBe(400);
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'approver' } : member,
    );
    const refused = await failureOf(async () =>
      updateRule({ path: { id: 'R-3' }, body: { status: 'accepted' }, throwOnError: true }),
    );
    expect(isApiFailure(refused) && refused.status).toBe(403);
    const bulk = await failureOf(async () =>
      bulkUpdateRules({ body: { ids: ['R-3'], status: 'accepted' }, throwOnError: true }),
    );
    expect(isApiFailure(bulk) && bulk.status).toBe(403);
  });

  it('decides several rules at once, skipping those already there', async () => {
    const { data } = await bulkUpdateRules({
      body: { ids: ['R-12', 'R-3', 'R-7'], status: 'accepted' },
      throwOnError: true,
    });
    expect(data.updated).toBe(2);
    const bad = await fetch('http://ostrom.test/api/v1/rules/bulk', { method: 'POST', body: '{"ids":[]}' });
    expect(bad.status).toBe(400);
  });

  it('lists signed decisions by subject', async () => {
    expect((await listDecisions({ throwOnError: true })).data.items.map((item) => item.id)).toEqual([
      'dec-2',
      'dec-1',
    ]);
    const one = await listDecisions({ query: { subjectKind: 'rule', subjectId: 'R-7' }, throwOnError: true });
    expect(one.data.items.map((item) => item.id)).toEqual(['dec-1']);
  });
});

describe('mock MCP servers and secrets', () => {
  const notion = {
    name: 'notion',
    url: 'https://mcp.notion.com/mcp',
    transport: 'http',
    secretNames: [],
    enabled: true,
    scope: 'org',
  };
  const demote = (): void => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
  };
  const status = async (call: () => Promise<unknown>): Promise<number | false> => {
    const error = await failureOf(call);
    return isApiFailure(error) && error.status;
  };
  const send = async (method: string, path: string, body: string): Promise<number> =>
    (await fetch(`http://ostrom.test/api/v1${path}`, { method, body })).status;

  it('adds, saves and removes an MCP server, refusing a duplicate, a bad URL and an unknown name', async () => {
    expect((await listMcpServers({ throwOnError: true })).data.items.map((server) => server.name)).toEqual([
      'linear',
      'sentry',
    ]);
    expect((await createMcpServer({ body: notion, throwOnError: true })).response.status).toBe(201);
    expect(await status(async () => createMcpServer({ body: notion, throwOnError: true }))).toBe(409);
    expect(
      await send('POST', '/mcp/servers', JSON.stringify({ ...notion, name: 'x2', url: 'http://a.b' })),
    ).toBe(400);
    const saved = await saveMcpServer({
      path: { name: 'notion' },
      body: { ...notion, enabled: false },
      throwOnError: true,
    });
    expect(saved.data.enabled).toBe(false);
    expect(await send('PUT', '/mcp/servers/notion', JSON.stringify({ ...notion, url: 'ftp://x' }))).toBe(400);
    expect(
      await status(async () => saveMcpServer({ path: { name: 'nope' }, body: notion, throwOnError: true })),
    ).toBe(404);
    await deleteMcpServer({ path: { name: 'notion' }, throwOnError: true });
    expect(await status(async () => deleteMcpServer({ path: { name: 'notion' }, throwOnError: true }))).toBe(
      404,
    );
  });

  it('lets only owners and admins change the MCP servers', async () => {
    demote();
    expect(await status(async () => createMcpServer({ body: notion, throwOnError: true }))).toBe(403);
    expect(
      await status(async () => saveMcpServer({ path: { name: 'linear' }, body: notion, throwOnError: true })),
    ).toBe(403);
    expect(await status(async () => deleteMcpServer({ path: { name: 'linear' }, throwOnError: true }))).toBe(
      403,
    );
  });

  it('lists the calls, by server, and counts them by server and tool', async () => {
    expect((await listMcpCalls({ throwOnError: true })).data.items).toHaveLength(3);
    db.mcpCalls = db.mcpCalls.map((call) => (call.id === 'call-3' ? { ...call, server: 'sentry' } : call));
    expect((await listMcpCalls({ query: { server: 'sentry' }, throwOnError: true })).data.items).toHaveLength(
      1,
    );
    expect((await getMcpUsage({ throwOnError: true })).data).toEqual({
      byServer: { sentry: 1, notion: 2 },
      byTool: { create_issue: 1, list_issues: 2 },
    });
  });

  it('creates and rotates a secret without ever giving its value back', async () => {
    const created = await createSecret({ body: { name: 'NPM_TOKEN', value: 's3cret' }, throwOnError: true });
    expect(created.response.status).toBe(201);
    expect(created.data).toMatchObject({ name: 'NPM_TOKEN', scope: 'org', updatedBy: 'maya' });
    expect(JSON.stringify(created.data)).not.toContain('s3cret');
    const scoped = await createSecret({
      body: { name: 'TEAM_KEY', value: 'v', scope: 'team:billing' },
      throwOnError: true,
    });
    expect(scoped.data.scope).toBe('team:billing');
    expect(
      await status(async () => createSecret({ body: { name: 'NPM_TOKEN', value: 'x' }, throwOnError: true })),
    ).toBe(409);
    expect(await send('POST', '/secrets', JSON.stringify({ name: 'lower', value: 'x' }))).toBe(400);
    expect(await send('POST', '/secrets', JSON.stringify({ name: 'EMPTY', value: '' }))).toBe(400);
    expect(await send('POST', '/secrets', 'nope')).toBe(400);
    const rotated = await rotateSecret({
      path: { name: 'STRIPE_TEST_KEY' },
      body: { name: 'STRIPE_TEST_KEY', value: 'new' },
      throwOnError: true,
    });
    expect(rotated.data.updatedBy).toBe('maya');
    expect(rotated.data.createdAt).toBe('2026-10-22T10:00:00.000Z');
    expect(
      await send('PUT', '/secrets/STRIPE_TEST_KEY', JSON.stringify({ name: 'STRIPE_TEST_KEY', value: '' })),
    ).toBe(400);
    expect(
      await status(async () =>
        rotateSecret({ path: { name: 'NOPE' }, body: { name: 'NOPE', value: 'x' }, throwOnError: true }),
      ),
    ).toBe(404);
    expect((await listSecrets({ throwOnError: true })).data.items).toHaveLength(4);
  });

  it('refuses to delete a secret an MCP server uses, or one that does not exist', async () => {
    expect(
      await status(async () => deleteSecret({ path: { name: 'LINEAR_TOKEN' }, throwOnError: true })),
    ).toBe(409);
    await deleteSecret({ path: { name: 'STRIPE_TEST_KEY' }, throwOnError: true });
    expect(
      await status(async () => deleteSecret({ path: { name: 'STRIPE_TEST_KEY' }, throwOnError: true })),
    ).toBe(404);
  });

  it('lets only owners and admins change the secrets', async () => {
    demote();
    expect(
      await status(async () => createSecret({ body: { name: 'A', value: 'x' }, throwOnError: true })),
    ).toBe(403);
    expect(
      await status(async () =>
        rotateSecret({
          path: { name: 'LINEAR_TOKEN' },
          body: { name: 'LINEAR_TOKEN', value: 'x' },
          throwOnError: true,
        }),
      ),
    ).toBe(403);
    expect(
      await status(async () => deleteSecret({ path: { name: 'STRIPE_TEST_KEY' }, throwOnError: true })),
    ).toBe(403);
  });
});

describe('mock spending and budgets', () => {
  const send = async (body: unknown): Promise<number> =>
    (await fetch('http://ostrom.test/api/v1/budgets', { method: 'PUT', body: JSON.stringify(body) })).status;

  it('serves the month by default, the week on request, and refuses another period', async () => {
    const month = (await getSpending({ throwOnError: true })).data;
    expect(month).toMatchObject({ period: 'month', budgetUsd: 1_200 });
    expect(month.daily).toHaveLength(7);
    expect(month.daily[6]?.date).toBe('2026-10-30');
    const week = (await getSpending({ query: { period: 'week' }, throwOnError: true })).data;
    expect(week.budgetUsd).toBeUndefined();
    expect(week.byAgent[0]).toEqual({ key: 'claude-code', label: 'Claude Code', usd: 201.4, sessions: 38 });
    const bad = await failureOf(async () => getSpending({ query: { period: 'year' }, throwOnError: true }));
    expect(isApiFailure(bad) && bad.status).toBe(400);
  });

  it('adds a budget or replaces the one with the same scope and subject', async () => {
    expect((await listBudgets({ throwOnError: true })).data.items).toHaveLength(2);
    await setBudget({ body: { scope: 'org', usdPerMonth: 1_500, hardStop: true }, throwOnError: true });
    await setBudget({
      body: { scope: 'workflow', subject: 'wf-backend', usdPerDay: 10, hardStop: false },
      throwOnError: true,
    });
    expect(db.budgets).toEqual([
      { scope: 'org', usdPerMonth: 1_500, hardStop: true },
      { scope: 'member', subject: 'theo', usdPerDay: 25, hardStop: true },
      { scope: 'workflow', subject: 'wf-backend', usdPerDay: 10, hardStop: false },
    ]);
  });

  it('refuses a budget without an amount, with a wrong subject or scope, and from a member', async () => {
    expect(await send({ scope: 'org', hardStop: false })).toBe(400);
    expect(await send({ scope: 'org', subject: 'x', usdPerDay: 1, hardStop: false })).toBe(400);
    expect(await send({ scope: 'member', usdPerDay: 1, hardStop: false })).toBe(400);
    expect(await send({ scope: 'team', subject: 'x', usdPerDay: 1, hardStop: false })).toBe(400);
    expect(await send({ scope: 'org', usdPerDay: -1, hardStop: false })).toBe(400);
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    expect(await send({ scope: 'org', usdPerDay: 1, hardStop: false })).toBe(403);
  });
});
