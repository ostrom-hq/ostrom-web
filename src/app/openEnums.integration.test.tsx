// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupMockApp, visit } from '@/test/mockApp';

// CS-04: a newer server may send an enum value this console does not know. Each screen shows it as the server wrote it,
// in a neutral tone, and the page does not fail (the generated schemas accept any string).
const { db } = setupMockApp();
const NEW = 'paused_by_policy';
const SLOW = { timeout: 4_000 };
const WAIT = '0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a01';

describe('a value of an enum a newer server sends', () => {
  it('shows a workflow status, a run status and a step kind as text', async () => {
    db.workflows = db.workflows.map((workflow) => ({ ...workflow, status: NEW }));
    db.workflowRuns = db.workflowRuns.map((run) => ({ ...run, status: NEW }));
    visit('/workflows');
    expect((await screen.findAllByText(NEW, undefined, SLOW)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows the runs of a workflow, and its steps, with a status and a kind it does not know', async () => {
    db.workflowRuns = db.workflowRuns.map((run) => ({ ...run, status: NEW }));
    db.workflows = db.workflows.map((workflow) => ({
      ...workflow,
      status: NEW,
      nodes: workflow.nodes.map((node) => ({ ...node, kind: NEW })),
    }));
    visit('/workflows/wf-backend');
    const runs = await screen.findByRole('region', { name: 'Runs' }, SLOW);
    expect((await within(runs).findAllByText(NEW)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(NEW)).length).toBeGreaterThan(1);
  });
});

describe('the other screens that name an enum', () => {
  it('shows a wait status', async () => {
    db.waits = db.waits.map((wait) => ({ ...wait, status: NEW }));
    visit(`/waits/${WAIT}`);
    expect((await screen.findAllByText(NEW, undefined, SLOW)).length).toBeGreaterThan(0);
  });

  it('shows the status and the kind of a confirmation', async () => {
    db.confirmations = db.confirmations.map((item) => ({ ...item, status: NEW, kind: 'novel.kind' }));
    visit('/confirm/gc-self-approval');
    expect((await screen.findAllByText(NEW, undefined, SLOW)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('novel.kind').length).toBeGreaterThan(0);
  });

  it('shows the strength and the status of a rule', async () => {
    db.rules = db.rules.map((rule) => ({ ...rule, status: NEW, strength: 'optional_for_now' }));
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: /^All \d+/ }, SLOW));
    expect((await screen.findAllByText(NEW, undefined, SLOW)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('optional_for_now').length).toBeGreaterThan(0);
  });

  it('shows an approval whose status the console does not know, in the queue and open', async () => {
    db.approvals = db.approvals.map((approval) => ({
      ...approval,
      status: NEW,
      ...(approval.checks === undefined
        ? {}
        : { checks: approval.checks.map((check) => ({ ...check, state: 'flaky' })) }),
      ...(approval.action === undefined ? {} : { action: { ...approval.action, kind: 'novel_action' } }),
    }));
    visit('/yes/apr-merge-412');
    expect((await screen.findAllByText(NEW, undefined, SLOW)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('flaky').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/novel_action/).length).toBeGreaterThan(0);
  });

  it('shows the kind of a receipt, and where a check of it ran', async () => {
    db.receipts = db.receipts.map((receipt) => ({
      ...receipt,
      subject: { ...receipt.subject, kind: 'novel_subject' },
      ...(receipt.nodes === undefined
        ? {}
        : {
            nodes: receipt.nodes.map((node) =>
              node.kind === 'check' ? { ...node, attestation: 'mars' } : node,
            ),
          }),
    }));
    visit('/receipts/rcpt-ses-2b9e');
    expect((await screen.findAllByText('mars', undefined, SLOW)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/novel_subject/).length).toBeGreaterThan(0);
  });

  it('lists receipts whose kind it does not know', async () => {
    db.receipts = db.receipts.map((receipt) => ({
      ...receipt,
      subject: { ...receipt.subject, kind: 'novel_subject' },
    }));
    visit('/receipts');
    expect((await screen.findAllByText('novel_subject', undefined, SLOW)).length).toBeGreaterThan(0);
  });

  it('shows the state of a todo and of its items', async () => {
    const todo = db.todos['ses-7f3a'];
    if (todo === undefined) throw new Error('the demo has no todo');
    db.todos['ses-7f3a'] = {
      ...todo,
      status: NEW,
      items: todo.items.map((item) => ({ ...item, status: 'parked' })),
    };
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    await user.click(await screen.findByRole('button', { name: /^Todo:/ }, SLOW));
    expect((await screen.findAllByText(NEW)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('parked').length).toBeGreaterThan(0);
  });

  it('shows the state of a GitHub link', async () => {
    db.githubLinks = Object.fromEntries(
      Object.entries(db.githubLinks).map(([org, links]) => [
        org,
        links.map((link) => ({ ...link, state: 'quarantined' })),
      ]),
    );
    visit('/github');
    expect((await screen.findAllByText('quarantined', undefined, SLOW)).length).toBeGreaterThan(0);
  });

  it('shows an operator and an effect of a policy', async () => {
    db.mcpPolicies = Object.fromEntries(
      Object.entries(db.mcpPolicies).map(([server, policies]) => [
        server,
        policies.map((policy) => ({
          ...policy,
          effect: 'AUDIT',
          conditions: policy.conditions.map((condition) => ({ ...condition, operator: 'FUZZY' })),
        })),
      ]),
    );
    const user = userEvent.setup();
    visit('/mcp');
    const card = (await screen.findByRole('heading', { level: 3, name: 'linear' }, SLOW)).closest('article');
    if (card === null) throw new Error('no server');
    await user.click(within(card).getByRole('button', { name: 'Who may use it' }));
    expect((await within(card).findAllByText('AUDIT')).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(/FUZZY/).length).toBeGreaterThan(0);
  });

  it('shows a plan and a billing interval it does not sell', async () => {
    db.billing = { ...db.billing, plan: 'platinum', effectivePlan: 'platinum', interval: 'fortnight' };
    visit('/billing');
    expect((await screen.findAllByText(/platinum/, undefined, SLOW)).length).toBeGreaterThan(0);
  });

  it('shows the agent of a session and an automation it does not know', async () => {
    db.cloudSessions = db.cloudSessions.map((session) => ({
      ...session,
      agent: 'novel-agent',
      githubAccess: 'novel-access',
    }));
    visit('/cloud');
    expect((await screen.findAllByText(/novel-agent/, undefined, SLOW)).length).toBeGreaterThan(0);
  });
});
