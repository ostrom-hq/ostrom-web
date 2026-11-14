// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function mine() {
  const found = db.skills.find((item) => item.name === 'maya-notes');
  if (found === undefined) throw new Error('no maya-notes');
  return found;
}

/** A second version of the person's skill, so that one can be pinned. */
function withASecondVersion(): void {
  db.skillVersions['maya-notes'] = [
    {
      version: '0.2.0',
      digest: `sha256:${'7'.repeat(64)}`,
      sizeBytes: 90,
      fileCount: 1,
      publishedBy: MEMBER_IDS.maya,
      publishedAt: '2026-11-06T08:00:00.000Z',
      retired: false,
      pinned: false,
    },
    ...(db.skillVersions['maya-notes'] ?? []),
    {
      version: '0.0.1',
      digest: `sha256:${'6'.repeat(64)}`,
      sizeBytes: 10,
      fileCount: 1,
      publishedBy: MEMBER_IDS.maya,
      publishedAt: '2026-11-01T08:00:00.000Z',
      retired: true,
      pinned: false,
    },
  ];
}

describe('my personal skills', () => {
  it('lists only the skills I published, with what is pinned', async () => {
    setDemoRole(db, 'member');
    visit('/me/skills');
    const list = await screen.findByRole('list', { name: 'Personal skills' });
    expect(screen.getByRole('heading', { level: 1, name: 'My personal skills' })).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('maya-notes');
    expect(list).toHaveTextContent('Pinned version 0.1.0');
    expect(list).toHaveTextContent('Active');
    expect(screen.getByRole('link', { name: 'Back to my delivered skills' })).toHaveAttribute(
      'href',
      `/members/${MEMBER_IDS.maya}/skills`,
    );
  });

  it('opens the versions of a skill, and pins another one', async () => {
    const user = userEvent.setup();
    withASecondVersion();
    visit('/me/skills');
    await user.click(await screen.findByRole('button', { name: 'Versions of maya-notes' }));
    const versions = await screen.findByRole('list', { name: 'Versions of maya-notes' });
    expect(within(versions).getAllByRole('listitem')).toHaveLength(3);
    expect(versions).toHaveTextContent('Retired');
    expect(within(versions).getAllByRole('button')).toHaveLength(1);
    await user.click(within(versions).getByRole('button', { name: 'Pin this version' }));
    await waitFor(() => {
      expect(mine().pinnedVersion).toBe('0.2.0');
    });
    // The one that is pinned has no button; the former one now has.
    await waitFor(() => {
      expect(within(versions).getAllByRole('button')).toHaveLength(1);
    });
    expect(within(versions).getByRole('button', { name: 'Pin this version' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide versions of maya-notes' }));
    expect(screen.queryByRole('list', { name: 'Versions of maya-notes' })).toBeNull();
  });

  it('says so for a skill without a version', async () => {
    const user = userEvent.setup();
    db.skillVersions['maya-notes'] = [];
    visit('/me/skills');
    await user.click(await screen.findByRole('button', { name: 'Versions of maya-notes' }));
    expect(await screen.findByText('No version has been published yet.')).toBeInTheDocument();
  });

  it('unpins, retires after a second click, and restores', async () => {
    const user = userEvent.setup();
    visit('/me/skills');
    await user.click(await screen.findByRole('button', { name: 'Unpin (stop delivery)' }));
    await waitFor(() => {
      expect(mine().pinnedVersion).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unpin (stop delivery)' })).toBeNull();
    });
    expect(screen.getByText('Not pinned: not delivered')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retire' }));
    await user.click(screen.getByRole('button', { name: 'Retire maya-notes' }));
    const restore = await screen.findByRole('button', { name: 'Restore skill' });
    expect(mine().retired).toBe(true);
    expect(screen.getByText('Retired')).toBeInTheDocument();
    await user.click(restore);
    await screen.findByRole('button', { name: 'Retire' });
    expect(mine().retired).toBe(false);
  });

  it('shows why a write was refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/me/skills/:name/pin', () =>
        HttpResponse.json(
          { error: { type: 'forbidden', message: 'A service key cannot do this.' } },
          { status: 403 },
        ),
      ),
    );
    visit('/me/skills');
    await user.click(await screen.findByRole('button', { name: 'Unpin (stop delivery)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A service key cannot do this.');
  });

  it('says so when I published nothing, and why the list did not load', async () => {
    db.skills = db.skills.filter((skill) => skill.ownerId !== MEMBER_IDS.maya);
    visit('/me/skills');
    expect(await screen.findByText(/You have no personal skill yet/)).toBeInTheDocument();
  });

  it('shows what the server said when the list is refused', async () => {
    server.use(
      http.get('*/api/v1/me/skills', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'no skills today' } }, { status: 500 }),
      ),
    );
    visit('/me/skills');
    expect(await screen.findByText('no skills today', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
