// SPDX-License-Identifier: Apache-2.0
import { handleListDeviceFolders, handleListDevices } from '@gen/api/msw.gen';
import type { CloudSessionResponse, DeviceResponse, ResumableSessionDto } from '@gen/api/types.gen';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { CONVERSATION_ID } from '@/mocks/cloudConversation';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

/** Where the device form keeps the last permission mode (`useDeviceStart`). */
const PERMISSION_MODE_KEY = 'ostrom.cloud.permissionMode';

const AT = '2026-11-16T09:00:00.000Z';
const LIMITS = { idleTimeoutMinutes: 60, maxRunMinutes: 480, restrictedEgress: false };

const ONLINE = { online: true, lastSeenAt: AT, features: ['resume.v1'] };

const session = (change: Partial<CloudSessionResponse> & Pick<CloudSessionResponse, 'id' | 'name'>) => ({
  owner: 'maya',
  agent: 'claude',
  status: 'running',
  desiredStatus: 'running',
  epoch: 1,
  limits: LIMITS,
  createdAt: AT,
  updatedAt: AT,
  ...change,
});

const HOST = {
  deviceId: 'dev-mac',
  deviceName: 'Ada’s Mac',
  platform: 'macos',
  osVersion: '26.1',
  directoryName: 'web',
  online: true,
  permissionMode: 'ask',
  folderId: 'f-web',
};

function withoutFeatures(...keys: readonly string[]): void {
  server.use(
    http.get('*/api/v1/capabilities', () =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((key) => !keys.includes(key)))),
    ),
  );
}

function sessionsRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Sessions' });
}

function row(text: string): HTMLElement {
  const found = within(sessionsRegion()).getByText(text).closest('li');
  if (found === null) throw new Error(`no row ${text}`);
  return found;
}

function urls(): string[] {
  const seen: string[] = [];
  traffic.onRequest((request) => {
    seen.push(request.url);
  });
  return seen;
}

describe('the sessions of both kinds (TeamCode cloud list --kind, companion KindChips)', () => {
  it('lists cloud and remote sessions, filters them by kind, and never asks for local ones', async () => {
    const user = userEvent.setup();
    const seen = urls();
    db.cloudSessions = [
      session({ id: 'cs-cloud', name: 'In a pod', image: 'ostrom/session:1' }),
      session({ id: 'cs-remote', name: 'On the Mac', kind: 'remote', mode: 'conversation', host: HOST }),
      session({ id: 'cs-local', name: 'A local run', kind: 'local' }),
    ];
    visit('/cloud');
    expect(await screen.findByText('On the Mac')).toBeInTheDocument();
    expect(row('In a pod')).toHaveTextContent('Cloud');
    expect(row('In a pod')).toHaveTextContent('ostrom/session:1');
    expect(row('On the Mac')).toHaveTextContent('Remote · Ada’s Mac');
    // A remote session runs in a folder of its device, never on an image.
    expect(row('On the Mac')).toHaveTextContent(/maya · Claude Code · web · started/);
    expect(within(sessionsRegion()).queryByText('A local run')).toBeNull();
    expect(seen.some((url) => url.endsWith('/cloud/sessions?kind=cloud&kind=remote'))).toBe(true);
    // A remote session is never transferred; the cloud one of the same owner is.
    expect(within(row('In a pod')).getByRole('button', { name: 'Transfer…' })).toBeInTheDocument();
    expect(within(row('On the Mac')).queryByRole('button', { name: 'Transfer…' })).toBeNull();

    const filter = screen.getByRole('group', { name: 'Where the sessions run' });
    // The rows shown stay until the other kinds' answer replaces them: no blank list between the two.
    server.use(
      http.get('*/api/v1/cloud/sessions', async () => {
        await delay(100);
      }),
    );
    await user.click(within(filter).getByRole('button', { name: 'Remote' }));
    expect(within(sessionsRegion()).getByText('In a pod')).toBeInTheDocument();
    await waitFor(() => {
      expect(within(sessionsRegion()).queryByText('In a pod')).toBeNull();
    });
    expect(within(sessionsRegion()).getByText('On the Mac')).toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: 'Remote' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(filter).getByRole('button', { name: 'Cloud' }));
    await waitFor(() => {
      expect(within(sessionsRegion()).queryByText('On the Mac')).toBeNull();
    });
    expect(within(sessionsRegion()).getByText('In a pod')).toBeInTheDocument();
    expect(seen.some((url) => url.endsWith('/cloud/sessions?kind=remote'))).toBe(true);
    expect(seen.some((url) => url.endsWith('/cloud/sessions?kind=cloud'))).toBe(true);
  });

  it('marks a device offline, a session waiting for its device, and one it refused, with why', async () => {
    db.cloudSessions = [
      session({
        id: 'cs-off',
        name: 'Gone quiet',
        kind: 'remote',
        status: 'paused',
        host: { ...HOST, online: false },
        failure: { code: 'host_offline', message: 'raw offline' },
      }),
      session({
        id: 'cs-wait',
        name: 'Not picked up',
        kind: 'remote',
        status: 'queued',
        phase: 'waiting_host',
        host: { deviceId: 'dev-x', deviceName: '' },
      }),
      session({
        id: 'cs-ref',
        name: 'Refused',
        kind: 'remote',
        status: 'failed',
        host: { ...HOST, deviceId: null },
        failure: {
          code: 'host_refused',
          message: 'The device refused to start this session (folder_moved).',
        },
      }),
      session({
        id: 'cs-other',
        name: 'Broke',
        kind: 'remote',
        status: 'failed',
        host: HOST,
        failure: { code: 'agent_crashed', message: 'The agent crashed.' },
      }),
    ];
    visit('/cloud');
    expect(await screen.findByText('Gone quiet')).toBeInTheDocument();
    expect(within(row('Gone quiet')).getByText('Offline')).toBeInTheDocument();
    expect(row('Gone quiet')).toHaveTextContent('Ada’s Mac stopped answering, so the session paused.');
    expect(row('Gone quiet')).not.toHaveTextContent('raw offline');
    expect(within(row('Not picked up')).getByText('Remote · unnamed device')).toBeInTheDocument();
    expect(within(row('Not picked up')).getByText('Waiting for the device')).toBeInTheDocument();
    expect(within(row('Refused')).getByText('Remote · removed device')).toBeInTheDocument();
    expect(within(row('Refused')).getByText('Refused by the device')).toBeInTheDocument();
    expect(row('Refused')).toHaveTextContent(
      'removed device refused to start this session: the folder now leads elsewhere',
    );
    expect(row('Broke')).toHaveTextContent('The agent crashed.');
  });

  it('shows neither the filter nor where a session runs on a server without remote sessions', async () => {
    withoutFeatures('runners.cloud.remote.v1');
    const seen = urls();
    visit('/cloud');
    expect(await screen.findByText('Fix the flaky invoice test')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Where the sessions run' })).toBeNull();
    expect(within(row('Fix the flaky invoice test')).queryByText('Cloud')).toBeNull();
    expect(seen.filter((url) => url.includes('/cloud/sessions')).every((url) => !url.includes('kind='))).toBe(
      true,
    );
  });
});

describe('a remote session’s screen (TeamCode SessionScreen details)', () => {
  function remoteConversation(change: Partial<CloudSessionResponse>): void {
    db.cloudSessions = db.cloudSessions.map((item) =>
      item.id === CONVERSATION_ID ? { ...item, kind: 'remote', host: HOST, ...change } : item,
    );
  }

  it('says where it runs: the device, its system, the folder, whether it answers and how the agent acts', async () => {
    remoteConversation({});
    visit(`/cloud/sessions/${CONVERSATION_ID}`);
    const card = await screen.findByRole('region', { name: 'Runs on' });
    expect(card).toHaveTextContent('Ada’s Mac');
    expect(within(card).getByText('Online')).toBeInTheDocument();
    expect(card).toHaveTextContent('macOS 26.1');
    expect(card).toHaveTextContent('Folderweb');
    expect(card).toHaveTextContent('Asks before acting');
    expect(screen.queryByText(/Paused on/)).toBeNull();
  });

  it('says a device offline, and a paused session that a message wakes on its device, with no Resume', async () => {
    remoteConversation({
      status: 'paused',
      host: { deviceId: 'dev-mac', deviceName: 'Ada’s Mac', online: false, permissionMode: 'bypass' },
      failure: { code: 'host_offline', message: 'gone' },
    });
    visit(`/cloud/sessions/${CONVERSATION_ID}`);
    const card = await screen.findByRole('region', { name: 'Runs on' });
    expect(within(card).getByText('Offline')).toBeInTheDocument();
    expect(card).toHaveTextContent('Acts without asking');
    expect(card).not.toHaveTextContent('System');
    expect(card).not.toHaveTextContent('Folder');
    expect(screen.getByText(/Ada’s Mac stopped answering, so the session paused/)).toBeInTheDocument();
    expect(await screen.findByText('Paused on Ada’s Mac. A message asks it to resume.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('shows no permission it has no words for, and no card for a cloud session', async () => {
    remoteConversation({ host: { deviceId: 'dev-mac', permissionMode: 'auto' } });
    visit(`/cloud/sessions/${CONVERSATION_ID}`);
    const card = await screen.findByRole('region', { name: 'Runs on' });
    expect(card).toHaveTextContent('unnamed device');
    expect(card).not.toHaveTextContent('Permissions');
  });

  it('names a removed device when the server sends no host', async () => {
    remoteConversation({ host: null });
    visit(`/cloud/sessions/${CONVERSATION_ID}`);
    const card = await screen.findByRole('region', { name: 'Runs on' });
    expect(card).toHaveTextContent('removed device');
    expect(within(card).getByText('Offline')).toBeInTheDocument();
  });

  it('has no host card for a cloud session', async () => {
    visit(`/cloud/sessions/${CONVERSATION_ID}`);
    await screen.findByRole('region', { name: 'Conversation' });
    expect(screen.queryByRole('region', { name: 'Runs on' })).toBeNull();
  });
});

describe('the idle pause of remote sessions (TeamCode dashboard “Remote sessions”)', () => {
  it('shows 60 minutes until saved, saves a change, and keeps it when another setting is saved', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const settings = await screen.findByRole('region', { name: 'Organization settings' });
    const remote = await within(settings).findByRole('group', { name: 'Remote sessions' });
    expect(remote).toHaveTextContent('A remote session runs on a member’s own device');
    const field = within(remote).getByLabelText(/^Pause idle remote sessions after/);
    expect(field).toHaveValue(60);
    await user.clear(field);
    await user.type(field, '2000');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    expect(
      within(settings).getByText(
        'Check “Pause idle remote sessions after, in minutes (0: never)” before saving.',
      ),
    ).toBeInTheDocument();
    expect(db.cloudSettings.remoteIdleTimeoutMinutes).toBeUndefined();
    await user.clear(field);
    await user.type(field, '15');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.cloudSettings.remoteIdleTimeoutMinutes).toBe(15);
    });
    const background = await within(settings).findByLabelText(/^Background work/);
    await user.clear(background);
    await user.type(background, '30');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.cloudSettings.backgroundWorkMaxMinutes).toBe(30);
    });
    expect(db.cloudSettings.remoteIdleTimeoutMinutes).toBe(15);
  });

  it('is not offered by a server without remote sessions', async () => {
    withoutFeatures('runners.cloud.remote.v1');
    visit('/cloud/admin');
    const settings = await screen.findByRole('region', { name: 'Organization settings' });
    await within(settings).findByLabelText(/^Background work/);
    expect(within(settings).queryByRole('group', { name: 'Remote sessions' })).toBeNull();
  });
});

describe('starting a session on an online device (TeamCode NewSessionViewModel)', () => {
  const resumable = (count: number): ResumableSessionDto[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `rs-${String(index + 1)}`,
      title: `Conversation ${String(index + 1)}`,
      lastActiveAt: new Date(Date.UTC(2026, 10, 16, 8, 59 - index)).toISOString(),
      turns: index === 0 ? 1 : index + 1,
    }));

  const MAC: DeviceResponse = {
    id: 'dev-mac',
    name: 'Ada’s Mac',
    kind: 'cli',
    platform: 'macos',
    osVersion: '26.1',
    current: true,
    daemon: ONLINE,
  };
  const BOX: DeviceResponse = {
    id: 'dev-box',
    name: 'Build box',
    kind: 'cli',
    platform: 'linux',
    daemon: { online: true, lastSeenAt: AT },
  };

  function withDevices(): void {
    db.devices = [
      MAC,
      BOX,
      { id: 'dev-off', name: 'Old laptop', kind: 'cli', daemon: { online: false, lastSeenAt: AT } },
    ];
    db.deviceFolders = {
      'dev-mac': [{ id: 'f-web', name: 'web', label: '~/code/web' }],
      'dev-box': [
        { id: 'f-b', name: 'billing', label: 'billing' },
        { id: 'f-a', name: 'api' },
      ],
    };
    db.resumable = { 'dev-mac/f-web': resumable(25) };
  }

  /** The device form, once the target turned to it; the cloud form stays mounted, hidden, beside it. */
  async function startForm(): Promise<HTMLElement> {
    const section = await screen.findByRole('region', { name: 'Start an agent' });
    const target = await within(section).findByRole('group', { name: 'Where should it run?' });
    await userEvent.click(within(target).getByRole('button', { name: 'Online device' }));
    return within(section).getByRole('form', { name: 'Online device' });
  }

  afterEach(() => {
    window.localStorage.removeItem(PERMISSION_MODE_KEY);
  });

  it('starts on a device, in its folder, continuing a conversation, with the permissions chosen', async () => {
    const user = userEvent.setup();
    withDevices();
    const sent: { body: unknown; key: string | null }[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && request.url.endsWith('/cloud/sessions'))
        void request
          .json()
          .then((body: unknown) => sent.push({ body, key: request.headers.get('Idempotency-Key') }));
    });
    visit('/cloud');
    const form = await startForm();
    const mac = await within(form).findByRole('radio', { name: /Ada’s Mac/ });
    expect(mac.closest('label')).toHaveTextContent('This device · macOS 26.1');
    expect(
      within(form)
        .getByRole('radio', { name: /Build box/ })
        .closest('label'),
    ).toHaveTextContent('Linux');
    expect(within(form).queryByRole('radio', { name: /Old laptop/ })).toBeNull();
    expect(within(form).getByRole('button', { name: 'Create the session' })).toBeDisabled();
    await user.click(mac);
    // Its only folder is chosen, and names the session.
    const folder = await within(form).findByRole('radio', { name: /web/ });
    expect(folder).toBeChecked();
    expect(folder.closest('label')).toHaveTextContent('~/code/web');
    expect(within(form).getByLabelText('Name')).toHaveValue('web');
    expect(form).toHaveTextContent('The folders this device’s owner allowed.');

    const resume = within(form).getByRole('group', { name: 'Resume a session' });
    await user.click(within(resume).getByRole('button', { name: 'None · A new conversation' }));
    expect(await within(resume).findByRole('radio', { name: /Conversation 20 · / })).toBeInTheDocument();
    expect(
      within(resume).getByRole('radio', { name: /Conversation 1 · .* · 1 message$/ }),
    ).toBeInTheDocument();
    expect(within(resume).queryByRole('radio', { name: /Conversation 21 · / })).toBeNull();
    await user.click(within(resume).getByRole('button', { name: 'Show older sessions' }));
    expect(await within(resume).findByRole('radio', { name: /Conversation 25 · / })).toBeInTheDocument();
    expect(within(resume).queryByRole('button', { name: 'Show older sessions' })).toBeNull();
    await user.click(within(resume).getByRole('radio', { name: /Conversation 22 · / }));
    // Back to a new conversation, then the one chosen again.
    await user.click(within(resume).getByRole('button', { name: /^Conversation 22 · / }));
    await user.click(within(resume).getByRole('radio', { name: /None · A new conversation/ }));
    expect(within(resume).getByRole('button', { name: 'None · A new conversation' })).toBeInTheDocument();
    await user.click(within(resume).getByRole('button', { name: 'None · A new conversation' }));
    await user.click(within(resume).getByRole('radio', { name: /Conversation 22 · / }));
    expect(
      within(resume).getByRole('button', { name: /^Conversation 22 · .* · 22 messages$/ }),
    ).toBeInTheDocument();
    expect(resume).toHaveTextContent('Continues a Claude Code conversation of this folder on Ada’s Mac');

    const permissions = within(form).getByRole('group', { name: 'Permissions' });
    expect(form).toHaveTextContent('Claude Code asks before acting');
    await user.click(within(permissions).getByRole('button', { name: 'Bypass' }));
    expect(form).toHaveTextContent(
      'The agent changes the folder’s files and runs commands on Ada’s Mac without asking.',
    );
    await user.type(within(form).getByLabelText('First message'), 'Fix the build');
    await user.type(within(form).getByLabelText('Model'), 'claude-opus-5');
    await user.type(within(form).getByLabelText('Effort'), 'high');
    await user.click(within(form).getByRole('button', { name: 'Start on Ada’s Mac' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toEqual({
      agent: 'claude',
      name: 'web',
      prompt: 'Fix the build',
      kind: 'remote',
      mode: 'conversation',
      deviceId: 'dev-mac',
      folderId: 'f-web',
      permissionMode: 'bypass',
      model: 'claude-opus-5',
      effort: 'high',
      resumeSessionId: 'rs-22',
    });
    expect(sent[0]?.key).toMatch(/.+/);
    // The new session waits for its device, and the choice of permissions is kept for the next one.
    expect(await within(sessionsRegion()).findByText('Waiting for the device')).toBeInTheDocument();
    expect(window.localStorage.getItem(PERMISSION_MODE_KEY)).toBe('bypass');
    expect(within(form).getByLabelText('First message')).toHaveValue('');
  });

  it('names the session as typed, offers no resume to Codex, and says an older daemon cannot resume', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PERMISSION_MODE_KEY, 'bypass');
    withDevices();
    db.deviceFolders['dev-mac'] = [];
    const sent: unknown[] = [];
    traffic.onRequest((request) => {
      if (request.method === 'POST' && request.url.endsWith('/cloud/sessions'))
        void request.json().then((body: unknown) => sent.push(body));
    });
    visit('/cloud');
    const form = await startForm();
    // The last launch's choice comes back.
    expect(
      within(within(form).getByRole('group', { name: 'Permissions' })).getByRole('button', {
        name: 'Bypass',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(await within(form).findByRole('radio', { name: /Ada’s Mac/ }));
    expect(await within(form).findByText(/This device offers no folder yet/)).toBeInTheDocument();
    // The same device again reads nothing more.
    await user.click(within(form).getByRole('radio', { name: /Ada’s Mac/ }));
    await user.click(within(form).getByRole('radio', { name: /Build box/ }));
    const api = await within(form).findByRole('radio', { name: /api/ });
    expect(api).not.toBeChecked();
    expect(
      within(form)
        .getByRole('radio', { name: /billing/ })
        .closest('label'),
    ).toHaveTextContent(/^billing$/);
    await user.click(api);
    expect(within(form).getByLabelText('Name')).toHaveValue('api');
    const resume = within(form).getByRole('group', { name: 'Resume a session' });
    expect(resume).toHaveTextContent('Update Ostrom on Build box (ostrom update) to resume a session there.');
    await user.click(
      within(within(form).getByRole('group', { name: 'Agent' })).getByRole('button', { name: 'Codex' }),
    );
    expect(within(form).queryByRole('group', { name: 'Resume a session' })).toBeNull();
    await user.clear(within(form).getByLabelText('Name'));
    await user.type(within(form).getByLabelText('Name'), 'Billing fix');
    await user.click(within(form).getByRole('radio', { name: /billing/ }));
    expect(within(form).getByLabelText('Name')).toHaveValue('Billing fix');
    await user.click(
      within(within(form).getByRole('group', { name: 'Permissions' })).getByRole('button', { name: 'Ask' }),
    );
    await user.click(within(form).getByRole('button', { name: 'Start on Build box' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]).toEqual({
      agent: 'codex',
      name: 'Billing fix',
      kind: 'remote',
      mode: 'conversation',
      deviceId: 'dev-box',
      folderId: 'f-b',
      permissionMode: 'ask',
    });
  });

  it('drops a device whose daemon went offline, and reads the devices again on Refresh', async () => {
    const user = userEvent.setup();
    withDevices();
    server.use(
      handleListDeviceFolders(({ params }) =>
        HttpResponse.json({ deviceId: params.id, daemon: { online: false, lastSeenAt: AT }, folders: [] }),
      ),
    );
    visit('/cloud');
    const form = await startForm();
    await user.click(await within(form).findByRole('radio', { name: /Build box/ }));
    expect(
      await within(form).findByText(/This device is offline: its Ostrom service is not connected/),
    ).toBeInTheDocument();
    expect(within(form).queryByRole('radio', { name: /Build box/ })).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Refresh' }));
    expect(await within(form).findByRole('radio', { name: /Build box/ })).toBeInTheDocument();
    expect(within(form).queryByRole('alert')).toBeNull();
  });

  it('says no device is online, and a device list or folders that could not be read', async () => {
    const user = userEvent.setup();
    db.devices = [{ id: 'dev-off', name: 'Old laptop', kind: 'cli' }];
    visit('/cloud');
    const form = await startForm();
    expect(await within(form).findByText(/None of your devices is online/)).toBeInTheDocument();

    // A device that reported no system yet.
    db.devices = [{ ...BOX, platform: null }];
    server.use(
      handleListDeviceFolders(() =>
        HttpResponse.json({ error: { type: 'boom', message: 'Folders failed.' } }, { status: 500 }),
      ),
    );
    await user.click(within(form).getByRole('button', { name: 'Refresh' }));
    // The only online device is chosen, and its folders are read.
    expect(await within(form).findByText('Folders failed.')).toBeInTheDocument();
    expect(within(form).getByRole('radio', { name: /Build box/ })).toBeChecked();
    expect(within(form).queryByText(/This device offers no folder yet/)).toBeNull();

    server.use(
      handleListDevices(() =>
        HttpResponse.json({ error: { type: 'boom', message: 'Devices failed.' } }, { status: 500 }),
      ),
    );
    await user.click(within(form).getByRole('button', { name: 'Refresh' }));
    expect(await within(form).findByText('Devices failed.')).toBeInTheDocument();
  });

  it('words a refusal of the start, and reads the device’s folders or devices again', async () => {
    const user = userEvent.setup();
    withDevices();
    visit('/cloud');
    const form = await startForm();
    await user.click(await within(form).findByRole('radio', { name: /Ada’s Mac/ }));
    await within(form).findByRole('radio', { name: /web/ });
    // The folder is no longer offered by the time the start reaches the server.
    db.deviceFolders['dev-mac'] = [];
    await user.click(within(form).getByRole('button', { name: 'Start on Ada’s Mac' }));
    // Said in the form, by its code, and not again above the list.
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      /This device no longer offers this folder/,
    );
    expect(screen.getAllByText(/This device no longer offers this folder/)).toHaveLength(1);
    await waitFor(() => {
      expect(within(form).queryByRole('radio', { name: /web/ })).toBeNull();
    });

    db.deviceFolders['dev-mac'] = [{ id: 'f-web', name: 'web' }];
    await user.click(within(form).getByRole('button', { name: 'Refresh' }));
    await within(form).findByRole('radio', { name: /web/ });
    // The device goes offline before the start reaches the server.
    db.devices = [{ ...MAC, daemon: { online: false, lastSeenAt: AT } }, BOX];
    await user.click(within(form).getByRole('button', { name: 'Start on Ada’s Mac' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/This device is offline/);
    await waitFor(() => {
      expect(within(form).queryByRole('radio', { name: /Ada’s Mac/ })).toBeNull();
    });
  });

  it('says why the conversations could not be read, reads them again, and says an empty folder', async () => {
    const user = userEvent.setup();
    withDevices();
    db.devices = [MAC];
    db.resumable = {};
    server.use(
      http.get('*/api/v1/devices/:id/folders/:folderId/resumable', () =>
        HttpResponse.json({ error: { type: 'folder_missing', message: 'raw' } }, { status: 409 }),
      ),
    );
    visit('/cloud');
    const form = await startForm();
    await within(form).findByRole('radio', { name: /web/ });
    const resume = within(form).getByRole('group', { name: 'Resume a session' });
    await user.click(within(resume).getByRole('button', { name: 'None · A new conversation' }));
    expect(
      await within(resume).findByText(/The device could not read this folder’s sessions \(folder_missing\)/),
    ).toBeInTheDocument();
    server.resetHandlers();
    await user.click(within(resume).getByRole('button', { name: 'Retry' }));
    expect(
      await within(resume).findByText('No earlier Claude Code session in this folder.'),
    ).toBeInTheDocument();
    await user.click(within(resume).getByRole('button', { name: 'None · A new conversation' }));
    expect(within(resume).queryByRole('radio')).toBeNull();
    // Opened again, the list read stays.
    await user.click(within(resume).getByRole('button', { name: 'None · A new conversation' }));
    expect(within(resume).getByText('No earlier Claude Code session in this folder.')).toBeInTheDocument();
  });

  it('says what loads and what is on its way, and goes back to the cloud form', async () => {
    const user = userEvent.setup();
    withDevices();
    db.devices = [MAC];
    server.use(
      handleListDevices(async () => {
        await delay(200);
        return HttpResponse.json({ items: db.devices });
      }),
      http.post('*/api/v1/cloud/sessions', async () => delay('infinite')),
    );
    visit('/cloud');
    // What was typed in the cloud form is still there once back from the device form.
    const section = await screen.findByRole('region', { name: 'Start an agent' });
    await user.type(await within(section).findByRole('textbox', { name: 'What should it do?' }), 'Keep me');
    const form = await startForm();
    expect(await within(form).findByText('Reading your online devices…')).toBeInTheDocument();
    await within(form).findByRole('radio', { name: /web/ });
    await user.click(within(form).getByRole('button', { name: 'Start on Ada’s Mac' }));
    expect(await within(form).findByRole('button', { name: 'Starting…' })).toBeDisabled();
    const target = within(section).getByRole('group', { name: 'Where should it run?' });
    await user.click(within(target).getByRole('button', { name: 'Cloud' }));
    expect(within(section).getByRole('textbox', { name: 'What should it do?' })).toHaveValue('Keep me');
  });

  it('offers only the cloud form on a server that does not start sessions on devices', async () => {
    withoutFeatures('runners.cloud.remote.daemon.v1');
    visit('/cloud');
    const form = await screen.findByRole('region', { name: 'Start an agent' });
    await within(form).findByLabelText('What should it do?');
    expect(within(form).queryByRole('group', { name: 'Where should it run?' })).toBeNull();
  });
});
