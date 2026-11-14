// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { largeMembers } from '@/mocks/fixtures/large';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

/** The demo person is a plain member: the console reads their role from the server's answer about them. */
function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

const refuse = (status: number, type: string, message: string) => () =>
  HttpResponse.json({ error: { type, message } }, { status });

/** The row of a list that holds `text`. */
function rowOf(list: HTMLElement, text: string): HTMLElement {
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(text) !== null);
  if (row === undefined) throw new Error(`no row ${text}`);
  return row;
}

async function catalog(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Skills' });
}

async function versions(name: string): Promise<HTMLElement> {
  return screen.findByRole('list', { name: `Versions of ${name}` });
}

function skill(name: string) {
  const found = db.skills.find((item) => item.name === name);
  if (found === undefined) throw new Error(`no skill ${name}`);
  return found;
}

describe('the skill catalog', () => {
  it('lists each skill with its pinned version, audience, state and when it changed', async () => {
    visit('/skills');
    const list = await catalog();
    expect(screen.getByRole('heading', { level: 1, name: 'Skill catalog' })).toBeInTheDocument();
    const review = rowOf(list, 'review-pr');
    expect(within(review).getByRole('link', { name: 'review-pr' })).toHaveAttribute(
      'href',
      '/skills/review-pr',
    );
    expect(review).toHaveTextContent('Pinned version 1.2.0');
    expect(review).toHaveTextContent('All members, except those set to No');
    expect(review).toHaveTextContent('Active');
    const notes = rowOf(list, 'release-notes');
    expect(notes).toHaveTextContent('Not pinned: not delivered');
    expect(notes).toHaveTextContent('Members set to Yes');
    expect(rowOf(list, 'old-lint')).toHaveTextContent('Retired');
    const personal = rowOf(list, 'maya-notes');
    expect(personal).toHaveTextContent('Personal skill: only Maya Lind (maya)');
    expect(within(personal).getByText('Personal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My delivered skills' })).toHaveAttribute(
      'href',
      `/members/${MEMBER_IDS.maya}/skills`,
    );
    expect(screen.getByRole('link', { name: 'My personal skills' })).toHaveAttribute('href', '/me/skills');
    await userEvent.setup().click(screen.getByText('How this works'));
    expect(screen.getByText(/published by CI through the API/)).toBeVisible();
  });

  it('names a personal skill’s owner by their id when the members cannot be read', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', refuse(403, 'forbidden', 'no members')));
    visit('/skills');
    expect(await screen.findByText(`Personal skill: only ${MEMBER_IDS.maya}`)).toBeInTheDocument();
  });

  it('says so when nothing has been published, and why the catalog did not load', async () => {
    db.skills = [];
    visit('/skills');
    expect(await screen.findByText('No skill has been published yet.')).toBeInTheDocument();
  });

  it('shows what the server said when the catalog is refused', async () => {
    server.use(http.get('*/api/v1/skills', refuse(500, 'internal', 'the catalog is down')));
    visit('/skills');
    expect(await screen.findByText('the catalog is down', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('sends a member who is not an administrator to the skills delivered to them, asking nothing of the catalog', async () => {
    asMember();
    let asked = false;
    server.use(
      http.get('*/api/v1/skills', () => {
        asked = true;
        return HttpResponse.json({ items: [] });
      }),
    );
    const router = visit('/skills');
    expect(await screen.findByRole('heading', { level: 1, name: 'Delivered skills' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/members/${MEMBER_IDS.maya}/skills`);
    expect(asked).toBe(false);
  });
});

describe('one skill', () => {
  it('lists its versions with digest, content and who published them, newest first', async () => {
    visit('/skills/review-pr');
    expect(await screen.findByRole('heading', { level: 1, name: 'Skill review-pr' })).toBeInTheDocument();
    const list = await versions('review-pr');
    const current = rowOf(list, '1.2.0');
    expect(current).toHaveTextContent('Pinned');
    expect(current).toHaveTextContent('3 files · 1204 bytes');
    expect(current).toHaveTextContent('Published by Lena Ortiz (lena)');
    expect(current).toHaveTextContent(`sha256:${'a'.repeat(64)}`);
    expect(current).toHaveTextContent('Approved and delivered');
    expect(within(current).queryByRole('button', { name: 'Pin this version' })).toBeNull();
    const old = rowOf(list, '1.0.0');
    expect(old).toHaveTextContent('Retired');
    expect(old).toHaveTextContent('Published by a-key-creator-that-left');
    expect(within(old).queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the catalog' })).toHaveAttribute('href', '/skills');
  });

  it('pins another version, which becomes the delivered one', async () => {
    const user = userEvent.setup();
    visit('/skills/review-pr');
    const list = await versions('review-pr');
    await user.click(within(rowOf(list, '1.1.0')).getByRole('button', { name: 'Pin this version' }));
    await waitFor(() => {
      expect(skill('review-pr').pinnedVersion).toBe('1.1.0');
    });
    await waitFor(() => {
      expect(within(rowOf(list, '1.1.0')).getByText('Approved and delivered')).toBeInTheDocument();
    });
    expect(
      within(rowOf(list, '1.2.0')).getByRole('button', { name: 'Pin this version' }),
    ).toBeInTheDocument();
  });

  it('unpins, and the button goes with the pin', async () => {
    const user = userEvent.setup();
    visit('/skills/review-pr');
    await user.click(await screen.findByRole('button', { name: 'Unpin (stop delivery)' }));
    await waitFor(() => {
      expect(skill('review-pr').pinnedVersion).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Unpin (stop delivery)' })).toBeNull();
    });
    await user.click(screen.getByText('How this works'));
    expect(screen.getByText(/No pinned version: nothing is delivered/)).toBeInTheDocument();
  });

  it('retires a version after a second click that names it, and keeps it if the person thinks again', async () => {
    const user = userEvent.setup();
    visit('/skills/review-pr');
    const list = await versions('review-pr');
    const row = rowOf(list, '1.1.0');
    await user.click(within(row).getByRole('button', { name: 'Retire version' }));
    await user.click(within(row).getByRole('button', { name: 'Keep' }));
    expect(within(row).getByRole('button', { name: 'Retire version' })).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Retire version' }));
    await user.click(within(row).getByRole('button', { name: 'Retire version 1.1.0 for good' }));
    await waitFor(() => {
      expect(within(rowOf(list, '1.1.0')).getByText('Retired')).toBeInTheDocument();
    });
    expect(db.skillVersions['review-pr']?.find((item) => item.version === '1.1.0')?.retired).toBe(true);
  });

  it('removes the skill from the catalog, then restores it without pinning anything', async () => {
    const user = userEvent.setup();
    visit('/skills/review-pr');
    await user.click(await screen.findByRole('button', { name: 'Remove from catalog' }));
    await user.click(screen.getByRole('button', { name: 'Remove review-pr from the catalog' }));
    const restore = await screen.findByRole('button', { name: 'Restore skill' });
    expect(skill('review-pr').retired).toBe(true);
    expect(skill('review-pr').pinnedVersion).toBeNull();
    // A retired skill can no longer be pinned: its versions carry no gesture.
    expect(within(await versions('review-pr')).queryByRole('button')).toBeNull();
    await user.click(screen.getByText('How this works'));
    expect(screen.getByText(/Restoring does not pin a version/)).toBeInTheDocument();
    await user.click(restore);
    await screen.findByRole('button', { name: 'Remove from catalog' });
    expect(skill('review-pr').retired).toBe(false);
    expect(skill('review-pr').pinnedVersion).toBeNull();
  });

  it('says so for a skill nobody published a version of', async () => {
    db.skillVersions['release-notes'] = [];
    visit('/skills/release-notes');
    expect(await screen.findByText('No version has been published yet.')).toBeInTheDocument();
  });

  it('shows why a skill is not there', async () => {
    visit('/skills/nope');
    expect(await screen.findByText('skill not found')).toBeInTheDocument();
  });

  it('shows why a write was refused, and holds the buttons while it is on its way', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/skills/:name/pin', refuse(409, 'skill_version_retired', 'That version is retired.')),
    );
    visit('/skills/review-pr');
    const list = await versions('review-pr');
    await user.click(within(rowOf(list, '1.1.0')).getByRole('button', { name: 'Pin this version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That version is retired.');
    expect(skill('review-pr').pinnedVersion).toBe('1.2.0');
    server.use(http.put('*/api/v1/skills/:name/pin', async () => delay('infinite')));
    await user.click(within(rowOf(list, '1.1.0')).getByRole('button', { name: 'Pin this version' }));
    await waitFor(() => {
      expect(within(rowOf(list, '1.1.0')).getByRole('button', { name: 'Pin this version' })).toBeDisabled();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('who receives a skill', () => {
  it('switches the audience between members set to Yes and all members', async () => {
    const user = userEvent.setup();
    visit('/skills/review-pr');
    const access = await screen.findByRole('region', { name: 'Access' });
    const form = within(access).getByRole('form', { name: 'Audience' });
    const select = within(form).getByRole('combobox', { name: 'Audience' });
    expect(select).toHaveValue('all');
    expect(within(form).getByRole('button', { name: 'Save audience' })).toBeDisabled();
    expect(access).toHaveTextContent('including members who join later, except those set to No');
    await user.selectOptions(select, 'assigned');
    await user.click(within(form).getByRole('button', { name: 'Save audience' }));
    await waitFor(() => {
      expect(skill('review-pr').allMembers).toBe(false);
    });
    await waitFor(() => {
      expect(access).toHaveTextContent(
        'Only Yes delivers the pinned version. Not assigned delivers nothing.',
      );
    });
    expect(within(access).getByRole('button', { name: 'Save audience' })).toBeDisabled();
    expect(access).toHaveTextContent('An explicit Yes or No always takes precedence.');
  });

  it('gives each member Default or Not assigned, Yes or No, and a link to what they receive', async () => {
    visit('/skills/review-pr');
    const members = await screen.findByRole('list', { name: 'Decision of each member' });
    expect(within(members).getAllByRole('listitem')).toHaveLength(5);
    expect(within(members).getByText('Inès Morel (ines)')).toBeInTheDocument();
    const theo = rowOf(members, 'theo');
    expect(within(theo).getByRole('combobox', { name: 'Decision for theo' })).toHaveValue('deny');
    const maya = rowOf(members, 'Maya Lind (maya)');
    expect(within(maya).getByRole('combobox', { name: 'Decision for Maya Lind (maya)' })).toHaveValue('none');
    expect(within(maya).getByRole('option', { name: 'Default (receives it)' })).toBeInTheDocument();
    expect(within(maya).getByRole('link', { name: 'Delivered skills and installations' })).toHaveAttribute(
      'href',
      `/members/${MEMBER_IDS.maya}/skills`,
    );
    expect(within(maya).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a member’s Yes or No, and clears it back to the default', async () => {
    const user = userEvent.setup();
    visit('/skills/review-pr');
    const members = await screen.findByRole('list', { name: 'Decision of each member' });
    const decisions = () => db.skillAssignments['review-pr']?.map((item) => [item.memberId, item.decision]);
    await user.selectOptions(within(rowOf(members, 'theo')).getByRole('combobox'), 'allow');
    await user.click(within(rowOf(members, 'theo')).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(decisions()).toEqual([[MEMBER_IDS.theo, 'allow']]);
    });
    await user.selectOptions(within(rowOf(members, 'Maya Lind (maya)')).getByRole('combobox'), 'deny');
    await user.click(within(rowOf(members, 'Maya Lind (maya)')).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(decisions()).toEqual([
        [MEMBER_IDS.theo, 'allow'],
        [MEMBER_IDS.maya, 'deny'],
      ]);
    });
    await waitFor(() => {
      expect(within(rowOf(members, 'theo')).getByRole('combobox')).toHaveValue('allow');
    });
    await user.selectOptions(within(rowOf(members, 'theo')).getByRole('combobox'), 'none');
    await user.click(within(rowOf(members, 'theo')).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(decisions()).toEqual([[MEMBER_IDS.maya, 'deny']]);
    });
  });

  it('calls the members’ default Not assigned when the audience is members set to Yes', async () => {
    skill('review-pr').allMembers = false;
    visit('/skills/review-pr');
    const members = await screen.findByRole('list', { name: 'Decision of each member' });
    expect(within(members).getAllByRole('option', { name: 'Not assigned' })).toHaveLength(5);
  });

  it('says the members cannot be read, and names a publisher by their id, when the server refuses them', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', refuse(403, 'forbidden', 'no members')));
    visit('/skills/review-pr');
    expect(
      await screen.findByText('The members could not be read, so their decisions cannot be shown.'),
    ).toBeInTheDocument();
    expect(await versions('review-pr')).toHaveTextContent(`Published by ${MEMBER_IDS.lena}`);
  });

  it('shows why the decisions did not load', async () => {
    server.use(http.get('*/api/v1/skills/:name/assignments', refuse(500, 'internal', 'no decisions')));
    visit('/skills/review-pr');
    expect(await screen.findByText('no decisions', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('a member’s personal skill', () => {
  it('has no audience nor decision, only its versions, and can be promoted to the team', async () => {
    const user = userEvent.setup();
    visit('/skills/maya-notes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Skill maya-notes' })).toBeInTheDocument();
    expect(await versions('maya-notes')).toHaveTextContent('0.1.0');
    expect(screen.queryByRole('region', { name: 'Access' })).toBeNull();
    expect(within(await versions('maya-notes')).queryByRole('button')).toBeNull();
    expect(screen.getByText(/Promoting clears its owner/)).toBeInTheDocument();
    await user.click(screen.getByText('How this works'));
    expect(screen.getByText(/only its owner receives it/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Promote to the team' }));
    await user.click(screen.getByRole('button', { name: 'Promote maya-notes to the team' }));
    // A team skill now: nothing pinned, the audience and decisions open.
    expect(await screen.findByRole('region', { name: 'Access' })).toBeInTheDocument();
    expect(skill('maya-notes').ownerId).toBeUndefined();
    expect(skill('maya-notes').pinnedVersion).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove from catalog' })).toBeInTheDocument();
    expect(
      within(await versions('maya-notes')).getByRole('button', { name: 'Pin this version' }),
    ).toBeInTheDocument();
  });

  it('shows the shape of the screen, and asks nothing of the catalog, until it knows who is looking', async () => {
    setDemoRole(db, 'member');
    let asked = false;
    server.use(
      http.get('*/api/v1/auth/me', async ({ request }) => {
        if (request.headers.has('Ostrom-Org')) return delay('infinite');
        return HttpResponse.json({ dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] });
      }),
      http.get('*/api/v1/skills', () => {
        asked = true;
        return HttpResponse.json({ items: [] });
      }),
    );
    const router = visit('/skills');
    await waitFor(() => expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/skills');
    expect(asked).toBe(false);
  });
});

describe('a team of more than a hundred people', () => {
  it('reads every page of members for the decisions, without being asked', async () => {
    const large = largeMembers().slice(0, 150);
    const far = large[130];
    if (far === undefined) throw new Error('no member 130');
    db.orgMembers[db.organization.id] = [...(db.orgMembers[db.organization.id] ?? []), ...large];
    visit('/skills/review-pr');
    const list = await screen.findByRole('list', { name: 'Decision of each member' });
    expect(
      await within(list).findByText(`${far.name} (${far.login})`, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(large.length);
    expect(screen.queryByRole('button', { name: 'Show more people' })).toBeNull();
  }, 15_000);
});
