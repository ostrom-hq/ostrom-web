// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function never(): never {
  throw new Error('the demo has no token');
}

function form(): HTMLElement {
  return screen.getByRole('region', { name: 'New token' });
}

async function liveTokens(): Promise<HTMLElement[]> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Live tokens' });
  const list = heading.parentElement?.querySelector('ul');
  if (list === null || list === undefined) throw new Error('no list of tokens');
  return within(list).getAllByRole('listitem');
}

describe('the tokens screen', () => {
  it('lists the live tokens with what they may do, the start of their secret, expiry and last use', async () => {
    visit('/tokens');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tokens' })).toBeInTheDocument();
    expect(await screen.findByText('2 live tokens · yours, in every organization')).toBeInTheDocument();
    const [ci, cli] = await liveTokens();
    expect(ci).toHaveTextContent('GitHub Actions');
    expect(ci).toHaveTextContent('receipts:read workflows:read');
    expect(ci).toHaveTextContent('Starts osp_7Hq2');
    expect(ci).toHaveTextContent(/expires .*2026/);
    expect(ci).toHaveTextContent(/last used .*2026/);
    expect(within(ci ?? document.body).getByText('Personal')).toBeInTheDocument();
    expect(cli).toHaveTextContent('never expires');
    expect(cli).toHaveTextContent('never used');
    expect(within(cli ?? document.body).getByText('CLI')).toBeInTheDocument();
  });

  it('creates a token that expires and shows its secret once, until it is copied', async () => {
    const user = userEvent.setup();
    visit('/tokens');
    await liveTokens();
    const create = within(form()).getByRole('button', { name: 'Create the token' });
    expect(create).toBeDisabled();
    await user.type(within(form()).getByRole('textbox', { name: 'Name' }), 'Nightly CI');
    expect(create).toBeDisabled();
    expect(within(form()).getByText('Tick at least one thing it may do.')).toBeInTheDocument();
    await user.click(within(form()).getByRole('checkbox', { name: 'Receipts: Read' }));
    await user.click(within(form()).getByRole('checkbox', { name: 'Workflows: Change' }));
    await user.click(within(form()).getByRole('checkbox', { name: 'Organizations: Read' }));
    await user.click(within(form()).getByRole('checkbox', { name: 'Workflows: Change' }));
    expect(within(form()).getByRole('combobox', { name: 'Expires' })).toHaveValue('30');
    await user.selectOptions(within(form()).getByRole('combobox', { name: 'Expires' }), '7');
    await user.click(create);
    const secret = await within(form()).findByRole('textbox', { name: 'Secret of Nightly CI' });
    const shown = secret instanceof HTMLInputElement ? secret.value : 'no secret';
    expect(shown).toMatch(/^osp_/);
    expect(within(form()).getByRole('alert')).toHaveTextContent('is shown once');
    // The form is ready for the next one; the list has the new token, without its secret.
    expect(within(form()).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(form()).getByRole('checkbox', { name: 'Receipts: Read' })).not.toBeChecked();
    await waitFor(async () => {
      expect(await liveTokens()).toHaveLength(3);
    });
    const [made] = await liveTokens();
    expect(made).toHaveTextContent('orgs:read receipts:read');
    expect(made).not.toHaveTextContent(shown);
    expect(db.tokens[0]).toMatchObject({ name: 'Nightly CI', scopes: ['orgs:read', 'receipts:read'] });
    expect(Date.parse(db.tokens[0]?.expiresAt ?? '') - Date.now()).toBeLessThanOrEqual(7 * 86_400_000);
    await user.click(within(form()).getByRole('button', { name: 'I copied it' }));
    expect(within(form()).queryByRole('textbox', { name: 'Secret of Nightly CI' })).toBeNull();
  });

  it('warns about a token that never expires, and sends no expiry for it', async () => {
    const user = userEvent.setup();
    let sent: unknown;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/api/v1/tokens'))
        void request
          .clone()
          .json()
          .then((body: unknown) => {
            sent = body;
          });
    });
    visit('/tokens');
    await liveTokens();
    await user.type(within(form()).getByRole('textbox', { name: 'Name' }), 'Forever');
    await user.click(within(form()).getByRole('checkbox', { name: 'Your profile: Read' }));
    await user.selectOptions(within(form()).getByRole('combobox', { name: 'Expires' }), 'null');
    expect(within(form()).getByText(/never expires works until you revoke it/)).toBeInTheDocument();
    await user.click(within(form()).getByRole('button', { name: 'Create the token' }));
    await within(form()).findByRole('textbox', { name: 'Secret of Forever' });
    expect(sent).toEqual({ name: 'Forever', scopes: ['profile:read'] });
    expect(db.tokens[0]?.expiresAt).toBeNull();
    server.events.removeAllListeners();
  });

  it('replaces a secret, shown once, and revokes a token', async () => {
    const user = userEvent.setup();
    visit('/tokens');
    const [ci] = await liveTokens();
    const row = ci ?? document.body;
    await user.click(within(row).getByRole('button', { name: 'Replace the secret' }));
    await user.click(within(row).getByRole('button', { name: 'Replace the secret of GitHub Actions' }));
    const replaced = await screen.findByRole('textbox', { name: 'Secret of GitHub Actions' });
    expect(replaced instanceof HTMLInputElement ? replaced.value : 'no secret').toMatch(/^osp_/);
    expect(db.tokens.map((token) => token.id)).not.toContain('tok-2');
    await user.click(screen.getByRole('button', { name: 'I copied it' }));
    expect(screen.queryByRole('textbox', { name: 'Secret of GitHub Actions' })).toBeNull();
    const cli = (await liveTokens()).find((item) => item.textContent.includes('ostrom on maya-mbp'));
    const cliRow = cli ?? document.body;
    await user.click(within(cliRow).getByRole('button', { name: 'Revoke' }));
    await user.click(within(cliRow).getByRole('button', { name: 'Revoke ostrom on maya-mbp' }));
    await waitFor(async () => {
      expect(await liveTokens()).toHaveLength(1);
    });
    expect(db.tokens.map((token) => token.name)).toEqual(['GitHub Actions']);
  });

  it('keeps a secret on screen until it is copied: nothing else on the page changes a token meanwhile', async () => {
    const user = userEvent.setup();
    visit('/tokens');
    const [ci] = await liveTokens();
    const row = ci ?? document.body;
    await user.click(within(row).getByRole('button', { name: 'Replace the secret' }));
    await user.click(within(row).getByRole('button', { name: 'Replace the secret of GitHub Actions' }));
    expect(await screen.findByRole('textbox', { name: 'Secret of GitHub Actions' })).toBeInTheDocument();
    expect(
      screen.getByText('Until you press I copied it, no token is created, replaced or revoked.'),
    ).toBeInTheDocument();
    const locked = async (): Promise<void> => {
      for (const item of await liveTokens()) {
        expect(within(item).getByRole('button', { name: 'Replace the secret' })).toBeDisabled();
        expect(within(item).getByRole('button', { name: 'Revoke' })).toBeDisabled();
      }
    };
    await locked();
    await user.type(within(form()).getByRole('textbox', { name: 'Name' }), 'One');
    await user.click(within(form()).getByRole('checkbox', { name: 'Usage: Read' }));
    expect(within(form()).getByRole('button', { name: 'Create the token' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'I copied it' }));
    // Then a created secret locks the page the same way.
    await user.click(within(form()).getByRole('button', { name: 'Create the token' }));
    await within(form()).findByRole('textbox', { name: 'Secret of One' });
    await locked();
    await user.type(within(form()).getByRole('textbox', { name: 'Name' }), 'Two');
    await user.click(within(form()).getByRole('checkbox', { name: 'Usage: Read' }));
    expect(within(form()).getByRole('button', { name: 'Create the token' })).toBeDisabled();
    await user.click(within(form()).getByRole('button', { name: 'I copied it' }));
    expect(within(form()).getByRole('button', { name: 'Create the token' })).toBeEnabled();
    for (const item of await liveTokens())
      expect(within(item).getByRole('button', { name: 'Revoke' })).toBeEnabled();
  });

  it('holds the page while a token is created or replaced', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/tokens', async () => delay('infinite')),
      http.post('*/api/v1/tokens/:id/rotate', async () => delay('infinite')),
    );
    visit('/tokens');
    const [ci] = await liveTokens();
    const row = ci ?? document.body;
    await user.click(within(row).getByRole('button', { name: 'Replace the secret' }));
    await user.click(within(row).getByRole('button', { name: 'Replace the secret of GitHub Actions' }));
    // While the new secret is on its way, nothing else changes a token.
    await waitFor(async () => {
      for (const item of await liveTokens())
        expect(within(item).getByRole('button', { name: 'Revoke' })).toBeDisabled();
    });
    expect(within(form()).getByRole('button', { name: 'Create the token' })).toBeDisabled();
  });

  it('shows the creation on its way, and a kind of token it does not know as the server says it', async () => {
    const user = userEvent.setup();
    db.tokens = [{ ...(db.tokens[0] ?? never()), id: 'tok-9', name: 'Service', kind: 'service' }];
    server.use(http.post('*/api/v1/tokens', async () => delay('infinite')));
    visit('/tokens');
    const [service] = await liveTokens();
    expect(service).toHaveTextContent('service');
    await user.type(within(form()).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(form()).getByRole('checkbox', { name: 'Usage: Read' }));
    await user.click(within(form()).getByRole('button', { name: 'Create the token' }));
    expect(await within(form()).findByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('says why a token was not created, revoked or replaced', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/tokens', () =>
        HttpResponse.json({ error: { type: 'invalid_request', message: 'scopes refused' } }, { status: 400 }),
      ),
      http.post('*/api/v1/tokens/:id/rotate', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'rotation is down' } }, { status: 500 }),
      ),
    );
    visit('/tokens');
    const [ci] = await liveTokens();
    await user.type(within(form()).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(form()).getByRole('checkbox', { name: 'Usage: Read' }));
    await user.click(within(form()).getByRole('button', { name: 'Create the token' }));
    expect(await within(form()).findByRole('alert')).toHaveTextContent('scopes refused');
    // Nothing typed is lost.
    expect(within(form()).getByRole('textbox', { name: 'Name' })).toHaveValue('CI');
    const row = ci ?? document.body;
    await user.click(within(row).getByRole('button', { name: 'Replace the secret' }));
    await user.click(within(row).getByRole('button', { name: 'Replace the secret of GitHub Actions' }));
    expect(await screen.findByText('rotation is down')).toBeInTheDocument();
    // A revocation clears what was said about the failed replacement.
    await user.click(within(row).getByRole('button', { name: 'Revoke' }));
    await user.click(within(row).getByRole('button', { name: 'Revoke GitHub Actions' }));
    await waitFor(() => {
      expect(screen.queryByText('rotation is down')).toBeNull();
    });
  });

  it('says there is no token yet', async () => {
    db.tokens = [];
    visit('/tokens');
    expect(await screen.findByText('No token yet')).toBeInTheDocument();
    expect(screen.getByText('0 live tokens · yours, in every organization')).toBeInTheDocument();
  });

  it('says why the list did not load', async () => {
    server.use(
      http.get('*/api/v1/tokens', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'tokens are down' } }, { status: 500 }),
      ),
    );
    visit('/tokens');
    expect(await screen.findByText('tokens are down')).toBeInTheDocument();
  });
});
