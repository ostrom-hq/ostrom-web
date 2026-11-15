// SPDX-License-Identifier: Apache-2.0
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function frame(): HTMLIFrameElement {
  const element = screen.getByTitle('Billing API: latency study');
  if (!(element instanceof HTMLIFrameElement)) throw new Error('no frame');
  return element;
}

function panel(name: string): HTMLElement {
  const summary = screen.getByText(name, { selector: 'summary' });
  const details = summary.closest('details');
  if (details === null) throw new Error(`no panel ${name}`);
  return details;
}

describe('an artifact’s reading page', () => {
  it('frames the latest version from its sealed ticket, sandboxed, with its versions and files', async () => {
    visit('/artifacts/art-7');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Billing API: latency study' }),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(frame()).toHaveAttribute('src', 'https://artifacts.ostrom.test/a/art-7/t3/index.html');
    });
    expect(frame()).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    expect(frame()).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByText(/by maya/)).toHaveTextContent(/version 3 ·/);
    expect(screen.queryByRole('link', { name: /the latest is/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open in the app' })).toBeNull();
    const versions = panel('Versions');
    expect(within(versions).getAllByRole('link')).toHaveLength(3);
    expect(within(versions).getByRole('link', { name: /^Version 3 /, current: 'page' })).toBeInTheDocument();
    const files = panel('Files');
    expect(files).toHaveTextContent('index.htmlpage');
    expect(files).toHaveTextContent('data.json');
    expect(screen.getByRole('link', { name: 'All artifacts' })).toHaveAttribute('href', '/artifacts');
  });

  it('pins a version with ?v=, links to the latest, and ignores a version that is no number', async () => {
    const user = userEvent.setup();
    visit('/artifacts/art-7?v=2');
    await vi.waitFor(() => {
      expect(frame()).toHaveAttribute('src', 'https://artifacts.ostrom.test/a/art-7/t2/index.html');
    });
    await user.click(screen.getByRole('link', { name: 'the latest is version 3' }));
    await vi.waitFor(() => {
      expect(frame()).toHaveAttribute('src', 'https://artifacts.ostrom.test/a/art-7/t3/index.html');
    });
    visit('/artifacts/art-5?v=zero');
    expect(await screen.findByTitle('Release checklist')).toHaveAttribute(
      'src',
      'https://artifacts.ostrom.test/a/art-5/t1/index.html',
    );
  });

  it('offers a newer version without reloading the frame, and shows it when asked', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(
        '*/api/v1/artifacts/:id/tickets',
        () => {
          const url = 'https://artifacts.ostrom.test/a/art-7/t2/index.html';
          return HttpResponse.json(
            { artifactId: 'art-7', version: 2, url, contentUrl: url, expiresAt: '2026-11-15T20:00:00.000Z' },
            { status: 201 },
          );
        },
        { once: true },
      ),
    );
    visit('/artifacts/art-7');
    expect(await screen.findByText('A newer version is published.')).toBeInTheDocument();
    expect(frame()).toHaveAttribute('src', 'https://artifacts.ostrom.test/a/art-7/t2/index.html');
    await user.click(screen.getByRole('button', { name: 'Show it' }));
    await vi.waitFor(() => {
      expect(frame()).toHaveAttribute('src', 'https://artifacts.ostrom.test/a/art-7/t3/index.html');
    });
    expect(screen.queryByText('A newer version is published.')).toBeNull();
  });

  it('says why the page cannot be shown, and frames no address that is not http(s)', async () => {
    server.use(
      http.post('*/api/v1/artifacts/:id/tickets', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'artifacts are off' } }, { status: 409 }),
      ),
    );
    visit('/artifacts/art-7');
    expect(await screen.findByText('The page cannot be shown: artifacts are off')).toBeInTheDocument();
    expect(screen.queryByTitle('Billing API: latency study')).toBeNull();
    server.use(
      http.post('*/api/v1/artifacts/:id/tickets', () =>
        HttpResponse.json(
          {
            artifactId: 'art-5',
            version: 1,
            url: 'javascript:alert(1)',
            contentUrl: 'javascript:alert(1)',
            expiresAt: '2026-11-15T20:00:00.000Z',
          },
          { status: 201 },
        ),
      ),
    );
    visit('/artifacts/art-5');
    expect(await screen.findByRole('heading', { level: 1, name: 'Release checklist' })).toBeInTheDocument();
    expect(screen.queryByTitle('Release checklist')).toBeNull();
  });

  it('gives the owner who reads it, its access and its deletion once its title is typed', async () => {
    const user = userEvent.setup();
    visit('/artifacts/art-7');
    await screen.findByRole('heading', { level: 1, name: 'Billing API: latency study' });
    const readers = panel('Readers');
    const access = within(readers).getByLabelText('Who reads it');
    const save = within(readers).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.selectOptions(access, 'team');
    await user.click(save);
    await vi.waitFor(() => {
      expect(db.artifacts.find((item) => item.id === 'art-7')?.access).toBe('team');
    });
    expect(await within(readers).findByText(/Everyone in the organization reads it/)).toBeInTheDocument();
    const remove = panel('Delete');
    const confirm = within(remove).getByRole('button', { name: 'Delete this artifact' });
    await user.type(within(remove).getByLabelText('Its title'), 'Billing API');
    expect(confirm).toBeDisabled();
    await user.type(within(remove).getByLabelText('Its title'), ': latency study');
    await user.click(confirm);
    expect(await screen.findByRole('heading', { level: 1, name: 'Artifacts' })).toBeInTheDocument();
    expect(db.artifacts.some((item) => item.id === 'art-7')).toBe(false);
  });

  it('says when the access cannot change, and keeps an access it has no word for', async () => {
    const user = userEvent.setup();
    db.artifacts = db.artifacts.map((item) => (item.id === 'art-7' ? { ...item, access: 'public' } : item));
    server.use(
      http.patch('*/api/v1/artifacts/:id', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'public sharing is off' } },
          { status: 403 },
        ),
      ),
    );
    visit('/artifacts/art-7');
    await screen.findByRole('heading', { level: 1, name: 'Billing API: latency study' });
    const readers = panel('Readers');
    const access = within(readers).getByLabelText('Who reads it');
    expect(access).toHaveValue('');
    await user.selectOptions(access, 'link');
    await user.click(within(readers).getByRole('button', { name: 'Save' }));
    expect(await within(readers).findByText('public sharing is off')).toBeInTheDocument();
  });

  it('sends nothing for a form that is not ready, and says when the deletion is refused', async () => {
    const user = userEvent.setup();
    db.artifacts = db.artifacts.map((item) => (item.id === 'art-7' ? { ...item, access: 'public' } : item));
    server.use(
      http.delete('*/api/v1/artifacts/:id', () =>
        HttpResponse.json({ error: { type: 'conflict', message: 'it is still linked' } }, { status: 409 }),
      ),
    );
    visit('/artifacts/art-7');
    await screen.findByRole('heading', { level: 1, name: 'Billing API: latency study' });
    const access = within(panel('Readers')).getByLabelText('Who reads it');
    await user.selectOptions(access, '');
    const accessForm = access.closest('form');
    if (accessForm === null) throw new Error('no access form');
    fireEvent.submit(accessForm);
    const remove = panel('Delete');
    const title = within(remove).getByLabelText('Its title');
    const deleteForm = title.closest('form');
    if (deleteForm === null) throw new Error('no delete form');
    fireEvent.submit(deleteForm);
    expect(db.artifacts.find((item) => item.id === 'art-7')?.access).toBe('public');
    await user.type(title, 'Billing API: latency study');
    await user.click(within(remove).getByRole('button', { name: 'Delete this artifact' }));
    expect(await screen.findByText('it is still linked')).toBeInTheDocument();
    expect(db.artifacts.some((item) => item.id === 'art-7')).toBe(true);
  });

  it('holds the deletion while it runs', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/artifacts/:id', async () => delay('infinite')));
    visit('/artifacts/art-2');
    await screen.findByRole('heading', { level: 1, name: 'Draft: pricing page' });
    const remove = panel('Delete');
    await user.type(within(remove).getByLabelText('Its title'), 'Draft: pricing page');
    await user.click(within(remove).getByRole('button', { name: 'Delete this artifact' }));
    await vi.waitFor(() => {
      expect(within(remove).getByRole('button', { name: 'Delete this artifact' })).toBeDisabled();
    });
  });

  it('gives a reader who is not the owner neither the access nor the deletion', async () => {
    visit('/artifacts/art-5');
    await screen.findByRole('heading', { level: 1, name: 'Release checklist' });
    expect(screen.queryByLabelText('Who reads it')).toBeNull();
    expect(screen.queryByText('Delete', { selector: 'summary' })).toBeNull();
    expect(screen.queryByText('Versions', { selector: 'summary' })).toBeNull();
  });

  it('links a phone to the app, and says when the artifact is not there', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)');
    visit('/artifacts/art-7');
    const link = await screen.findByRole('link', { name: 'Open in the app' });
    expect(link.getAttribute('href')).toMatch(/^ostrom:\/\/open\?url=http%3A%2F%2F/);
    vi.restoreAllMocks();
    visit('/artifacts/art-404');
    expect(await screen.findByText('artifact not found')).toBeInTheDocument();
  });
});
