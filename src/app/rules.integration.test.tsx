// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

function card(text: RegExp): HTMLElement {
  const found = screen.getByText(text).closest('article');
  if (found === null) throw new Error(`no rule ${String(text)}`);
  return found;
}

function viewerIs(role: 'owner' | 'member'): void {
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role },
        capabilities: [],
      }),
    ),
  );
}

describe('the rules', () => {
  it('opens on what is left to review, grouped, with the evidence', async () => {
    visit('/rules');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rules' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'To review 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Accepted 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejected 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Reviews',
      'Tests',
    ]);
    const review = card(/one review from an owner/);
    expect(review).toHaveTextContent('Required');
    expect(review).toHaveTextContent('96 % sure');
    expect(review).toHaveTextContent('Why: Every merge to main');
    expect(review).toHaveTextContent('acme/billing-api · acme/web');
    expect(within(review).getByRole('link', { name: 'acme/billing-api#398' })).toHaveAttribute(
      'href',
      'https://github.com/acme/billing-api/pull/398',
    );
    expect(within(review).queryByRole('link', { name: 'CODEOWNERS' })).toBeNull();
    expect(within(review).getByText('acme/web#77')).toBeInTheDocument();
    const tests = card(/Run `pnpm test`/);
    expect(within(tests).queryByRole('list')).toBeNull();
    expect(tests).not.toHaveTextContent('Why');
  });

  it('accepts a rule, signs it, and shows who decided', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(
      within(await findCard(/one review from an owner/)).getByRole('button', { name: 'Accept' }),
    );
    expect(await screen.findByRole('button', { name: 'To review 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accepted 2' }));
    expect(card(/one review from an owner/)).toHaveTextContent(/Accepted by maya · /);
    expect(db.decisions[0]).toMatchObject({ subject: { id: 'R-12' }, action: 'accepted' });
  });

  it('rejects a rule and reopens a decided one', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(within(await findCard(/Run `pnpm test`/)).getByRole('button', { name: 'Reject' }));
    await user.click(await screen.findByRole('button', { name: 'Rejected 2' }));
    const rejected = card(/Run `pnpm test`/);
    expect(rejected).toHaveTextContent(/Rejected by maya/);
    await user.click(within(rejected).getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByRole('button', { name: 'Rejected 1' })).toBeInTheDocument();
  });

  it('fixes a rule before accepting it, and keeps the editor open until the server took it', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    const text = within(tests).getByRole('textbox', { name: 'Rule' });
    await user.clear(text);
    expect(within(tests).getByRole('button', { name: 'Save and accept' })).toBeDisabled();
    await user.type(text, 'Run the tests and the linter before pushing.');
    await user.selectOptions(within(tests).getByRole('combobox', { name: 'Strength' }), 'required');
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    await user.click(await screen.findByRole('button', { name: 'Accepted 2' }));
    const fixed = card(/Run the tests and the linter/);
    expect(fixed).toHaveTextContent('Accepted with a fix');
    expect(fixed).toHaveTextContent('Required');
  });

  it('accepts a proposed rule saved with only a new strength, and cancels an edit', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    await user.click(within(tests).getByRole('button', { name: 'Cancel' }));
    expect(within(tests).queryByRole('textbox')).toBeNull();
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    await user.selectOptions(within(tests).getByRole('combobox', { name: 'Strength' }), 'required');
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    await user.click(await screen.findByRole('button', { name: 'Accepted 2' }));
    const fixed = card(/Run `pnpm test`/);
    expect(fixed).toHaveTextContent('Accepted with a fix');
    expect(fixed).toHaveTextContent('Required');
  });

  it('accepts a proposed rule saved unchanged from its editor', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    await user.click(await screen.findByRole('button', { name: 'Accepted 2' }));
    expect(card(/Run `pnpm test`/)).toHaveTextContent(/Accepted by maya/);
  });

  it('sends only the text when the strength is unchanged, and ignores a strength it does not know', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(tests).getByRole('combobox', { name: 'Strength' }), {
      target: { value: 'mandatory' },
    });
    const text = within(tests).getByRole('textbox', { name: 'Rule' });
    await user.clear(text);
    await user.type(text, 'Run the whole test suite before pushing.');
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    await user.click(await screen.findByRole('button', { name: 'Accepted 2' }));
    expect(card(/Run the whole test suite/)).toHaveTextContent('Accepted with a fix');
  });

  it('holds a rule while it saves', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/rules/:id', async () => delay('infinite')));
    visit('/rules');
    const review = await findCard(/one review from an owner/);
    await user.click(within(review).getByRole('button', { name: 'Accept' }));
    expect(within(review).getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('holds a fixed rule while it saves', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/rules/:id', async () => delay('infinite')));
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    await user.selectOptions(within(tests).getByRole('combobox', { name: 'Strength' }), 'required');
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    expect(await within(tests).findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('says when a decision is refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(
        '*/api/v1/rules/:id',
        () => HttpResponse.json({ error: { type: 'forbidden', message: 'owners only' } }, { status: 403 }),
        { once: true },
      ),
    );
    visit('/rules');
    await user.click(
      within(await findCard(/one review from an owner/)).getByRole('button', { name: 'Accept' }),
    );
    const review = card(/one review from an owner/);
    expect(await within(review).findByRole('alert')).toHaveTextContent('owners only');
    // The refusal is said on its rule only.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // Tried again, the refusal goes.
    await user.click(within(review).getByRole('button', { name: 'Accept' }));
    // Accepted, it leaves what is to review, and no refusal is left behind.
    await waitFor(() => {
      expect(screen.queryByText(/one review from an owner/)).toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('still says a refusal that comes back once its rule left the list', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch('*/api/v1/rules/:id', async () => {
        await held;
        return HttpResponse.json({ error: { type: 'forbidden', message: 'owners only' } }, { status: 403 });
      }),
    );
    visit('/rules');
    await user.click(
      within(await findCard(/one review from an owner/)).getByRole('button', { name: 'Accept' }),
    );
    await user.click(screen.getByRole('button', { name: /^Rejected/ }));
    release();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '“A pull request into main needs one review from an owner of the repository.” was not saved: owners only',
    );
  });

  it('accepts every sure proposal in one gesture', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'Accept the 1 rule at 90 % or more' }));
    expect(await screen.findByText('1 rule accepted.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'To review 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /at 90 % or more/ })).toBeNull();
  });

  it('says when accepting several rules failed', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/rules/bulk', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: /at 90 % or more/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('disables the bulk button while it sends', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/rules/bulk', async () => delay('infinite')));
    visit('/rules');
    const bulk = await screen.findByRole('button', { name: /at 90 % or more/ });
    await user.click(bulk);
    expect(bulk).toBeDisabled();
  });

  it('shows rules without decisions to someone who does not decide', async () => {
    viewerIs('member');
    visit('/rules');
    expect(await screen.findByText(/one review from an owner/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: /at 90 % or more/ })).toBeNull();
  });

  it('gives an owner the decisions', async () => {
    viewerIs('owner');
    visit('/rules');
    expect(await screen.findAllByRole('button', { name: 'Accept' })).toHaveLength(2);
  });

  it('says when a filter is empty, for each filter', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/rules', () => HttpResponse.json({ items: [] })));
    visit('/rules');
    expect(await screen.findByText('Nothing left to review.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accepted 0' }));
    expect(screen.getByText('No rule accepted yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rejected 0' }));
    expect(screen.getByText('No rule rejected.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All 0' }));
    expect(screen.getByText(/No rule yet/)).toBeInTheDocument();
  });

  it('shows the shape of the list while it loads', async () => {
    server.use(http.get('*/api/v1/rules', never));
    visit('/rules');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says why the list does not come', async () => {
    server.use(http.get('*/api/v1/rules', () => HttpResponse.error()));
    visit('/rules');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('the decisions', () => {
  it('lists every signed decision, newest first, each opening its receipt', async () => {
    visit('/decisions');
    const rows = await screen.findAllByRole('link', { name: /maya|lena/ });
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'maya rejected the rule',
      'lena accepted the rule',
    ]);
    expect(rows[0]).toHaveTextContent('Commit messages are in French.');
    expect(rows[1]).toHaveTextContent('R-7');
    expect(rows[0]).toHaveAttribute('href', '/receipts/rcpt-dec-2');
  });

  it('shows a decision it has no words for as the server wrote it', async () => {
    server.use(
      http.get('*/api/v1/decisions', () =>
        HttpResponse.json({
          items: [
            {
              id: 'd',
              at: '2026-10-30T08:00:00.000Z',
              by: 'lena',
              subject: { kind: 'harness', id: 'h-1' },
              action: 'archived',
              receiptId: 'r',
            },
          ],
        }),
      ),
    );
    visit('/decisions');
    expect(await screen.findByText('lena archived the harness')).toBeInTheDocument();
  });

  it('says when there is no decision yet', async () => {
    server.use(http.get('*/api/v1/decisions', () => HttpResponse.json({ items: [] })));
    visit('/decisions');
    expect(await screen.findByText('No decision yet.')).toBeInTheDocument();
  });
});

describe('writing and gating rules', () => {
  function newRule(): HTMLElement {
    return screen.getByRole('region', { name: 'A new rule' });
  }

  it('writes a rule, signed, found among the accepted ones', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const form = newRule();
    expect(within(form).getByRole('button', { name: 'Add the rule' })).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'Rule' }), 'Read the runbook before a deploy.');
    expect(within(form).getByRole('button', { name: 'Add the rule' })).toBeDisabled();
    await user.type(within(form).getByRole('combobox', { name: 'Group' }), 'Ops');
    await user.type(within(form).getByRole('textbox', { name: 'Repositories' }), 'acme/web, acme/api');
    await user.type(within(form).getByRole('textbox', { name: 'Why' }), 'It saves an hour.');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Strength' }), 'recommended');
    expect(form.querySelector('datalist option[value="Releases"]')).not.toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Add the rule' }));
    expect(await screen.findByRole('button', { name: 'Accepted 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'A new rule' })).toBeNull();
    const written = card(/Read the runbook/);
    expect(written).toHaveTextContent('Recommended');
    expect(written).toHaveTextContent('acme/web · acme/api');
    expect(db.rules[0]).toMatchObject({ group: 'Ops', output: 'note', why: 'It saves an hour.' });
    expect(db.decisions[0]).toMatchObject({ subject: { id: db.rules[0]?.id }, action: 'accepted' });
  });

  it('puts a gate with a rule: the actions of the catalogue, who says yes, the checks it needs', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const form = newRule();
    await user.type(within(form).getByRole('textbox', { name: 'Rule' }), 'A deploy waits for a yes.');
    await user.type(within(form).getByRole('combobox', { name: 'Group' }), 'Releases');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'What it does' }), 'gate');
    const gate = within(form).getByRole('group', { name: 'Gate' });
    expect(within(form).getByText('Pick at least one action for the gate.')).toBeInTheDocument();
    await user.click(await within(gate).findByRole('checkbox', { name: /Deploy/ }));
    expect(within(form).getByText('Name at least one person who may say yes.')).toBeInTheDocument();
    await user.click(within(gate).getByRole('checkbox', { name: /Merge into main/ }));
    await user.click(within(gate).getByRole('checkbox', { name: /Merge into main/ }));
    await user.type(within(gate).getByRole('textbox', { name: 'Who may say yes' }), 'samir, maya');
    await user.type(within(gate).getByRole('textbox', { name: 'Shown with the request' }), 'Release owners');
    await user.click(within(gate).getByRole('button', { name: 'Add a check' }));
    expect(within(form).getByText('Give each check its id, or remove it.')).toBeInTheDocument();
    await user.type(within(gate).getByRole('textbox', { name: 'Check 1' }), 'n-tests');
    await user.click(within(gate).getByRole('checkbox', { name: 'Only a run on a runner or in CI counts' }));
    await user.click(within(gate).getByRole('button', { name: 'Add a check' }));
    await user.type(within(gate).getByRole('textbox', { name: 'Check 2' }), 'n-lint');
    await user.click(within(gate).getByRole('button', { name: 'Add a check' }));
    await user.click(within(gate).getByRole('button', { name: 'Remove check 3' }));
    expect(within(gate).queryByRole('textbox', { name: 'Check 3' })).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Add the rule' }));
    const gated = await findCard(/A deploy waits for a yes/);
    expect(gated).toHaveTextContent('Gate: Deploy, waits for a yes from samir, maya');
    expect(gated).toHaveTextContent('Needs: n-tests (runner or CI), n-lint');
    expect(db.rules[0]?.gate).toEqual({
      actions: [
        {
          class: 'deploy',
          label: 'Deploy',
          patterns: ['helm upgrade', 'kubectl apply'],
          repos: ['acme/billing-api'],
        },
      ],
      approvers: ['samir', 'maya'],
      reason: 'Release owners',
      checks: [
        { check: 'n-tests', attested: true },
        { check: 'n-lint', attested: false },
      ],
    });
  });

  it('says while the catalogue loads, when it is empty, and when it fails', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/gates/catalog', never));
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    await user.selectOptions(within(newRule()).getByRole('combobox', { name: 'What it does' }), 'gate');
    expect(within(newRule()).getByText('Reading the actions of the catalogue…')).toBeInTheDocument();
    await user.click(within(newRule()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'A new rule' })).toBeNull();

    server.use(http.get('*/api/v1/gates/catalog', () => HttpResponse.json({ gates: [], actions: [] })));
    await user.click(screen.getByRole('button', { name: 'New rule' }));
    await user.selectOptions(within(newRule()).getByRole('combobox', { name: 'What it does' }), 'gate');
    expect(await within(newRule()).findByText(/The catalogue has no action yet/)).toBeInTheDocument();
  });

  it('writes the first action of a gate by hand when the catalogue has none', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/gates/catalog', () => HttpResponse.json({ gates: [], actions: [] })));
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const form = newRule();
    await user.type(within(form).getByRole('textbox', { name: 'Rule' }), 'Migrations wait for a yes.');
    await user.type(within(form).getByRole('combobox', { name: 'Group' }), 'Releases');
    await user.type(within(form).getByRole('textbox', { name: 'Repositories' }), 'acme/api');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'What it does' }), 'gate');
    const gate = within(form).getByRole('group', { name: 'Gate' });
    expect(await within(gate).findByText(/write the first one below/)).toBeInTheDocument();
    // A label alone matches nothing: the action needs a command.
    await user.type(within(gate).getByRole('textbox', { name: 'Another action' }), 'Run a migration');
    expect(within(gate).getByRole('button', { name: 'Add the action' })).toBeDisabled();
    await user.type(
      within(gate).getByRole('textbox', { name: 'Its commands' }),
      'flyway migrate, rails db:migrate',
    );
    await user.click(within(gate).getByRole('button', { name: 'Add the action' }));
    expect(within(gate).getByRole('checkbox', { name: /Run a migration/ })).toBeChecked();
    expect(within(gate).getByRole('textbox', { name: 'Another action' })).toHaveValue('');
    // Enter adds the action without sending the rule; the same label again is ticked above, never written twice.
    await user.type(within(gate).getByRole('textbox', { name: 'Another action' }), 'Seed the base');
    await user.type(within(gate).getByRole('textbox', { name: 'Its commands' }), 'rails db:seed{Enter}');
    expect(within(gate).getByRole('checkbox', { name: /Seed the base/ })).toBeChecked();
    expect(newRule()).toBeInTheDocument();
    await user.type(within(gate).getByRole('textbox', { name: 'Another action' }), 'Run a migration');
    await user.type(within(gate).getByRole('textbox', { name: 'Its commands' }), 'prisma migrate{Enter}');
    expect(within(gate).getByText('This action is already in the list: tick it above.')).toBeInTheDocument();
    expect(within(gate).getByRole('button', { name: 'Add the action' })).toBeDisabled();
    expect(within(gate).getAllByRole('checkbox', { name: /Run a migration/ })).toHaveLength(1);
    await user.click(within(gate).getByRole('checkbox', { name: /Seed the base/ }));
    await user.type(within(gate).getByRole('textbox', { name: 'Who may say yes' }), 'lena');
    // Its repositories are the rule's when the rule is saved, not when the action was written.
    const scope = within(form).getByRole('textbox', { name: 'Repositories' });
    await user.clear(scope);
    await user.type(scope, 'acme/web');
    await user.click(within(form).getByRole('button', { name: 'Add the rule' }));
    expect(await findCard(/Migrations wait for a yes/)).toHaveTextContent(
      'Gate: Run a migration, waits for a yes from lena',
    );
    expect(db.rules[0]?.gate?.actions).toEqual([
      {
        class: 'run-a-migration',
        label: 'Run a migration',
        patterns: ['flyway migrate', 'rails db:migrate'],
        repos: ['acme/web'],
      },
    ]);
  });

  it('waits for a word being composed before adding the action', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/gates/catalog', () => HttpResponse.json({ gates: [], actions: [] })));
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const form = newRule();
    await user.selectOptions(within(form).getByRole('combobox', { name: 'What it does' }), 'gate');
    const gate = within(form).getByRole('group', { name: 'Gate' });
    await user.type(within(gate).getByRole('textbox', { name: 'Another action' }), '部署');
    const commands = within(gate).getByRole('textbox', { name: 'Its commands' });
    await user.type(commands, 'kubectl apply');
    // The Enter that ends a composition picks the word; it does not add the action.
    fireEvent.keyDown(commands, { key: 'Enter', isComposing: true });
    // Safari sends it once the composition ended, with the key code of an input method.
    fireEvent.keyDown(commands, { key: 'Enter', keyCode: 229 });
    expect(within(gate).queryByRole('checkbox', { name: /部署/ })).toBeNull();
    fireEvent.keyDown(commands, { key: 'Enter' });
    expect(within(gate).getByRole('checkbox', { name: /部署/ })).toBeChecked();
  });

  it('says when the catalogue fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/gates/catalog', () =>
        HttpResponse.json({ error: { type: 'unavailable', message: 'No catalogue.' } }, { status: 503 }),
      ),
    );
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    await user.selectOptions(within(newRule()).getByRole('combobox', { name: 'What it does' }), 'gate');
    expect(await within(newRule()).findByText('No catalogue.')).toBeInTheDocument();
  });

  it('says when a rule cannot be written, and keeps the form', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/rules', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'Already a rule.' } }, { status: 409 }),
      ),
    );
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    await user.type(within(newRule()).getByRole('textbox', { name: 'Rule' }), 'Twice.');
    await user.type(within(newRule()).getByRole('combobox', { name: 'Group' }), 'Ops');
    await user.click(within(newRule()).getByRole('button', { name: 'Add the rule' }));
    expect(await screen.findByText('Already a rule.')).toBeInTheDocument();
    expect(newRule()).toBeInTheDocument();
  });

  it('holds a new rule while it is written', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/rules', never));
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    await user.type(within(newRule()).getByRole('textbox', { name: 'Rule' }), 'Slow.');
    await user.type(within(newRule()).getByRole('combobox', { name: 'Group' }), 'Ops');
    await user.click(within(newRule()).getByRole('button', { name: 'Add the rule' }));
    expect(await within(newRule()).findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('edits a decided rule: where it holds, why, and takes its gate off', async () => {
    const user = userEvent.setup();
    const deploy = { class: 'deploy', label: 'Deploy', patterns: ['helm upgrade'], repos: [] };
    server.use(http.get('*/api/v1/gates/catalog', () => HttpResponse.json({ gates: [], actions: [deploy] })));
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'Accepted 1' }));
    const migrations = card(/Migrations run only/);
    expect(migrations).toHaveTextContent('Gate: Run a migration, waits for a yes from lena');
    expect(migrations).toHaveTextContent('Needs: n-tests (runner or CI)');
    await user.click(within(migrations).getByRole('button', { name: 'Edit' }));
    const gate = within(migrations).getByRole('group', { name: 'Gate' });
    // The rule gates an action the catalogue no longer has: it stays offered, ticked.
    expect(await within(gate).findByRole('checkbox', { name: /Run a migration/ })).toBeChecked();
    expect(within(gate).getByRole('checkbox', { name: /Deploy/ })).not.toBeChecked();
    // Nothing changed: the editor closes and nothing is signed.
    const before = db.decisions.length;
    await user.click(within(migrations).getByRole('button', { name: 'Save' }));
    expect(within(migrations).queryByRole('group', { name: 'Gate' })).toBeNull();
    expect(db.decisions).toHaveLength(before);

    await user.click(within(migrations).getByRole('button', { name: 'Edit' }));
    const why = within(migrations).getByRole('textbox', { name: 'Why' });
    await user.type(why, 'Two outages in May.');
    await user.selectOptions(within(migrations).getByRole('combobox', { name: 'What it does' }), 'note');
    await user.click(within(migrations).getByRole('button', { name: 'Save' }));
    expect(await within(migrations).findByText('Why: Two outages in May.')).toBeInTheDocument();
    expect(migrations).not.toHaveTextContent('Gate:');
    expect(db.rules.find((rule) => rule.id === 'R-7')?.gate).toBeUndefined();
  });

  it('shows a gate without checks, and an action without commands by its label alone', async () => {
    const user = userEvent.setup();
    const push = { class: 'push', label: 'Push', patterns: [], repos: [] };
    server.use(http.get('*/api/v1/gates/catalog', () => HttpResponse.json({ gates: [], actions: [push] })));
    db.rules = db.rules.map((rule) =>
      rule.id === 'R-3'
        ? { ...rule, output: 'gate', gate: { actions: [push], approvers: ['maya'], checks: [] } }
        : rule,
    );
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    expect(tests).toHaveTextContent('Gate: Push, waits for a yes from maya');
    expect(tests).not.toHaveTextContent('Needs:');
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    expect(await within(tests).findByRole('checkbox', { name: 'Push' })).toBeChecked();
  });

  it('clears the why of a rule, signed as an edit, and shows no empty line', async () => {
    const user = userEvent.setup();
    db.rules = db.rules.map((rule) => (rule.id === 'R-7' ? { ...rule, why: 'Two outages.' } : rule));
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'Accepted 1' }));
    const migrations = card(/Migrations run only/);
    expect(migrations).toHaveTextContent('Why: Two outages.');
    await user.click(within(migrations).getByRole('button', { name: 'Edit' }));
    await user.clear(within(migrations).getByRole('textbox', { name: 'Why' }));
    await user.click(within(migrations).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(migrations).not.toHaveTextContent('Why:');
    });
    expect(db.decisions[0]).toMatchObject({ subject: { id: 'R-7' }, action: 'edited' });
  });

  it('closes an editor once its save is signed, even when another rule is decided meanwhile', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch('*/api/v1/rules/R-7', async () => {
        await held;
        return undefined;
      }),
    );
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'All 4' }));
    const migrations = card(/Migrations run only/);
    await user.click(within(migrations).getByRole('button', { name: 'Edit' }));
    await user.type(within(migrations).getByRole('textbox', { name: 'Why' }), 'Two outages.');
    await user.click(within(migrations).getByRole('button', { name: 'Save' }));
    await user.click(within(card(/one review from an owner/)).getByRole('button', { name: 'Reject' }));
    expect(await within(card(/one review from an owner/)).findByText(/Rejected by maya/)).toBeInTheDocument();
    expect(within(migrations).getByRole('textbox', { name: 'Why' })).toBeInTheDocument();
    // Its own save is still on its way: the editor stays held.
    expect(within(migrations).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    release();
    expect(await within(migrations).findByText('Why: Two outages.')).toBeInTheDocument();
    expect(within(migrations).queryByRole('textbox', { name: 'Why' })).toBeNull();
  });

  it('closes an editor whose rule was decided meanwhile', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'All 4' }));
    const review = card(/one review from an owner/);
    await user.click(within(review).getByRole('button', { name: 'Edit' }));
    expect(within(review).getByRole('button', { name: 'Save and accept' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept the 1 rule at 90 % or more' }));
    expect(await within(review).findByText(/Accepted by maya/)).toBeInTheDocument();
    expect(within(review).queryByRole('button', { name: /Save/ })).toBeNull();
    expect(within(review).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('keeps the editor of an accepted rule open when it is edited elsewhere', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'All 4' }));
    const migrations = card(/Migrations run only/);
    await user.click(within(migrations).getByRole('button', { name: 'Edit' }));
    // Someone else rewords it: still accepted, now edited.
    const rule = db.rules.find((one) => one.id === 'R-7');
    if (rule === undefined) throw new Error('no R-7');
    rule.status = 'edited';
    rule.statement = 'Migrations run only after a yes from a release owner.';
    await user.click(within(card(/one review from an owner/)).getByRole('button', { name: 'Reject' }));
    expect(await within(card(/one review from an owner/)).findByText(/Rejected by maya/)).toBeInTheDocument();
    expect(within(migrations).getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('says why a save was refused, and keeps its editor open', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/rules/R-7', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'Changed meanwhile.' } }, { status: 409 }),
      ),
    );
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'Accepted 1' }));
    const migrations = card(/Migrations run only/);
    await user.click(within(migrations).getByRole('button', { name: 'Edit' }));
    await user.type(within(migrations).getByRole('textbox', { name: 'Why' }), 'x');
    await user.click(within(migrations).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Changed meanwhile.')).toBeInTheDocument();
    expect(within(migrations).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps an output it has no words for, shown as the server wrote it', async () => {
    const user = userEvent.setup();
    db.rules = db.rules.map((rule) => (rule.id === 'R-3' ? { ...rule, output: 'banner' } : rule));
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    expect(within(tests).getByRole('combobox', { name: 'What it does' })).toHaveDisplayValue('banner');
  });

  it('deletes a rule after asking, signed', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Delete' }));
    await user.click(within(tests).getByRole('button', { name: 'Keep' }));
    await user.click(within(tests).getByRole('button', { name: 'Delete' }));
    await user.click(within(tests).getByRole('button', { name: 'Delete this rule' }));
    expect(await screen.findByRole('button', { name: 'To review 1' })).toBeInTheDocument();
    expect(screen.queryByText(/Run `pnpm test`/)).toBeNull();
    expect(db.decisions[0]).toMatchObject({ subject: { id: 'R-3' }, action: 'deleted' });
    expect(screen.getByText('Rule deleted.')).toBeInTheDocument();
    // Once the person moves on, the banner goes.
    await user.click(screen.getByRole('button', { name: 'All 3' }));
    expect(screen.queryByText('Rule deleted.')).toBeNull();
  });

  it('keeps the answer of a delete still on its way when the person moves on', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.delete('*/api/v1/rules/:id', async () => {
        await held;
        return undefined;
      }),
    );
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Delete' }));
    await user.click(within(tests).getByRole('button', { name: 'Delete this rule' }));
    await user.click(screen.getByRole('button', { name: /^All/ }));
    release();
    expect(await screen.findByText('Rule deleted.')).toBeInTheDocument();
  });

  it('says when a rule cannot be deleted', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/rules/:id', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'Still used by a gate.' } }, { status: 409 }),
      ),
    );
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Delete' }));
    await user.click(within(tests).getByRole('button', { name: 'Delete this rule' }));
    expect(await screen.findByText('Still used by a gate.')).toBeInTheDocument();
  });

  it('gives someone who does not decide neither a new rule nor a delete', async () => {
    viewerIs('member');
    visit('/rules');
    await findCard(/Run `pnpm test`/);
    expect(screen.queryByRole('button', { name: 'New rule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

async function findCard(text: RegExp): Promise<HTMLElement> {
  await screen.findByText(text);
  return card(text);
}
