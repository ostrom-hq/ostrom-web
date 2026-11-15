// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Memory curation' });
}

function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', name: 'Maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

describe('the memory curation setting', () => {
  it('is off by default, never run, and an administrator turns it on and off', async () => {
    const user = userEvent.setup();
    visit('/settings');
    const box = await section();
    const toggle = await within(box).findByRole('switch', { name: 'Curate the organization’s memory' });
    expect(toggle).not.toBeChecked();
    expect(within(box).getByText('It has not run yet.')).toBeInTheDocument();
    await user.click(toggle);
    await within(box).findByRole('switch', { checked: true });
    expect(db.memoryCuration.enabled).toBe(true);
    await user.click(within(box).getByRole('switch'));
    await within(box).findByRole('switch', { checked: false });
    expect(db.memoryCuration.enabled).toBe(false);
  });

  it('says what the last run did', async () => {
    db.memoryCuration = {
      enabled: true,
      lastRunAt: '2026-11-14T10:00:00.000Z',
      lastRunId: 'run-1',
      lastSuperseded: 3,
      lastQueued: 1,
    };
    visit('/settings');
    const box = await section();
    expect(await within(box).findByRole('switch')).toBeChecked();
    expect(within(box).getByText(/3 superseded, 1 queued for review\./)).toBeInTheDocument();
  });

  it('counts a run that reported nothing as zero', async () => {
    db.memoryCuration = { enabled: true, lastRunAt: '2026-11-14T10:00:00.000Z' };
    visit('/settings');
    const box = await section();
    expect(await within(box).findByText(/0 superseded, 0 queued for review\./)).toBeInTheDocument();
  });

  it('says why a change was refused, and keeps the switch as the server has it', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/memory/curation', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'not you' } }, { status: 403 }),
      ),
    );
    visit('/settings');
    const box = await section();
    await user.click(await within(box).findByRole('switch'));
    expect(await within(box).findByText('not you')).toBeInTheDocument();
    expect(within(box).getByRole('switch')).not.toBeChecked();
  });

  it('holds the switch while the server takes the change', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/memory/curation', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/settings');
    const box = await section();
    await user.click(await within(box).findByRole('switch'));
    expect(within(box).getByRole('switch')).toBeDisabled();
  });

  it('says it did not read the setting', async () => {
    server.use(
      http.get('*/api/v1/memory/curation', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'memory is down' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    const box = await section();
    expect(await within(box).findByText('memory is down', {}, { timeout: 4_000 })).toBeInTheDocument();
  });

  it('is not shown to a member, and nothing is asked of the server for one', async () => {
    asMember();
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/settings');
    await screen.findByText('How Acme is named, who is signed in, and deleting it.');
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Memory curation' })).toBeNull();
    expect(asked).not.toContain('/api/v1/memory/curation');
  });

  it('is not shown by a server that does not announce memory.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'memory.v1'))),
      ),
    );
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/settings');
    await screen.findByText('How Acme is named, who is signed in, and deleting it.');
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Memory curation' })).toBeNull();
    expect(asked).not.toContain('/api/v1/memory/curation');
  });
});
