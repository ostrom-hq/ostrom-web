// SPDX-License-Identifier: Apache-2.0
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import { handleListDeviceFolders, handleListDevices, handleListResumableSessions } from '@gen/api/msw.gen';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, HttpResponse } from 'msw';
import type { ReactElement, ReactNode } from 'react';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import { setupMockApp } from '@/test/mockApp';
import type { SessionChangeViewModel } from './useCloud';
import { useDeviceStart } from './useDeviceStart';

const { server, db, traffic } = setupMockApp();

const AT = '2026-11-16T09:00:00.000Z';
const ONLINE = { online: true, lastSeenAt: AT, features: ['resume.v1'] };

/** Signed in, as the top bar makes it: the server's capabilities are read once `/auth/me` is. */
function SignedIn(): null {
  useQuery(ready(getMeOptions()));
  return null;
}

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SignedIn />
      {children}
    </QueryClientProvider>
  );
}

function changeOf(change: Partial<SessionChangeViewModel> = {}): SessionChangeViewModel {
  return {
    start: vi.fn(),
    startOnDevice: vi.fn(),
    stop: vi.fn(),
    starting: false,
    stopping: undefined,
    failure: undefined,
    startFailure: undefined,
    ...change,
  };
}

/** The form, once the server said it resumes conversations. */
async function form(change: SessionChangeViewModel = changeOf()) {
  const hook = renderHook(
    () => ({ view: useDeviceStart(change), resumes: useAnnounced('runners.cloud.remote.resume.v1') }),
    { wrapper },
  );
  await waitFor(() => {
    expect(hook.result.current.resumes).toBe(true);
  });
  return hook;
}

beforeEach(() => {
  db.devices = [
    { id: 'dev-a', name: 'Alpha', daemon: ONLINE },
    { id: 'dev-b', name: 'Beta', daemon: ONLINE },
  ];
  db.deviceFolders = {
    'dev-a': [{ id: 'fa', name: 'alpha-web' }],
    'dev-b': [
      { id: 'fb1', name: 'beta-api' },
      { id: 'fb2', name: 'beta-web' },
    ],
  };
  db.resumable = { 'dev-a/fa': [{ id: 'r1', title: 'One', lastActiveAt: AT, turns: 1 }] };
});

describe('the device form, as a hook (TeamCode NewSessionViewModel)', () => {
  it('changes nothing while a start is on its way', async () => {
    const startOnDevice = vi.fn();
    const { result } = await form(changeOf({ starting: true, startOnDevice }));
    act(() => {
      result.current.view.loadDevices();
      result.current.view.onName('typed');
      result.current.view.onResumeOpen();
      result.current.view.create();
    });
    expect(result.current.view.state.devices).toBeUndefined();
    expect(result.current.view.state.name).toBe('');
    expect(result.current.view.creating).toBe(true);
    expect(startOnDevice).not.toHaveBeenCalled();
  });

  it('ignores a device or a folder it does not list, and a retry, more or a start without a folder', async () => {
    const startOnDevice = vi.fn();
    const { result } = await form(changeOf({ startOnDevice }));
    act(() => {
      result.current.view.onDevice('nope');
      result.current.view.onFolder('nope');
      result.current.view.onResumeRetry();
      result.current.view.onResumeMore();
      result.current.view.onResumeOpen();
      result.current.view.onAgent('claude');
      result.current.view.create();
    });
    expect(result.current.view.state.deviceId).toBeUndefined();
    expect(result.current.view.state.folderId).toBeUndefined();
    expect(result.current.view.state.loadingResumable).toBe(false);
    expect(startOnDevice).not.toHaveBeenCalled();
  });

  it('keeps the device and folder chosen across a Refresh, and reads a device again only after a failure', async () => {
    const seen: string[] = [];
    traffic.onRequest((request) => {
      if (request.url.includes('/folders')) seen.push(request.url);
    });
    const { result } = await form();
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.devices).toHaveLength(2);
    });
    act(() => {
      result.current.view.onDevice('dev-b');
    });
    await waitFor(() => {
      expect(result.current.view.state.folders).toHaveLength(2);
    });
    expect(result.current.view.state.folderId).toBeUndefined();
    act(() => {
      result.current.view.onFolder('fb2');
      result.current.view.onDevice('dev-b');
    });
    expect(seen).toHaveLength(1);
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(seen).toHaveLength(2);
    });
    await waitFor(() => {
      expect(result.current.view.state.loadingFolders).toBe(false);
    });
    expect(result.current.view.state.deviceId).toBe('dev-b');
    expect(result.current.view.state.folderId).toBe('fb2');
    expect(result.current.view.state.name).toBe('beta-web');

    server.use(
      handleListDeviceFolders(() =>
        HttpResponse.json({ error: { type: 'boom', message: 'down' } }, { status: 500 }),
      ),
    );
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.error?.message).toBe('down');
    });
    server.resetHandlers();
    act(() => {
      result.current.view.onDevice('dev-b');
    });
    await waitFor(() => {
      expect(seen).toHaveLength(4);
    });
  });

  it('counts only the answer for the device still chosen', async () => {
    server.use(
      handleListDeviceFolders(async ({ params }) => {
        if (params.id === 'dev-a') {
          await delay(50);
          return db.devices.length === 2
            ? HttpResponse.json({
                deviceId: 'dev-a',
                daemon: ONLINE,
                folders: [{ id: 'fa', name: 'alpha-web' }],
              })
            : HttpResponse.json({ error: { type: 'boom', message: 'late' } }, { status: 500 });
        }
        return HttpResponse.json({
          deviceId: 'dev-b',
          daemon: ONLINE,
          folders: db.deviceFolders['dev-b'] ?? [],
        });
      }),
    );
    const { result } = await form();
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.devices).toHaveLength(2);
    });
    // Two at once: the first is dropped before it asks.
    act(() => {
      result.current.view.onDevice('dev-a');
      result.current.view.onDevice('dev-b');
    });
    await delay(120);
    // A late success, then a late failure, for a device no longer chosen.
    for (const devices of [2, 3]) {
      if (devices === 3) db.devices = [...db.devices, { id: 'dev-c', name: 'Gamma' }];
      act(() => {
        result.current.view.onDevice('dev-a');
      });
      await delay(10);
      act(() => {
        result.current.view.onDevice('dev-b');
      });
      await delay(120);
      expect(result.current.view.state.deviceId).toBe('dev-b');
      expect(result.current.view.state.folders?.map((folder) => folder.id)).toEqual(['fb1', 'fb2']);
      expect(result.current.view.state.error).toBeUndefined();
    }
  });

  it('counts only the conversations of the folder still chosen, and reads one page at a time', async () => {
    let fail = false;
    server.use(
      handleListResumableSessions(async () => {
        await delay(50);
        return fail
          ? HttpResponse.json({ error: { type: 'boom', message: 'late' } }, { status: 500 })
          : HttpResponse.json({ items: [{ id: 'r1', title: 'One', lastActiveAt: AT, turns: 1 }], next: AT });
      }),
    );
    db.devices = [{ id: 'dev-a', name: 'Alpha', daemon: ONLINE }];
    db.deviceFolders['dev-a'] = [
      { id: 'fa', name: 'alpha-web' },
      { id: 'fz', name: 'zeta' },
    ];
    const { result } = await form();
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.folders).toHaveLength(2);
    });
    for (const failing of [false, true]) {
      fail = failing;
      act(() => {
        result.current.view.onFolder('fa');
      });
      act(() => {
        result.current.view.onResumeOpen();
      });
      // Opened again while it loads: no second read; neither a retry nor more meanwhile.
      act(() => {
        result.current.view.onResumeOpen();
        result.current.view.onResumeOpen();
        result.current.view.onResumeRetry();
      });
      expect(result.current.view.state.loadingResumable).toBe(true);
      act(() => {
        result.current.view.onFolder('fz');
      });
      await delay(120);
      expect(result.current.view.state.resumable).toBeUndefined();
      expect(result.current.view.state.resumableError).toBeUndefined();
    }
    fail = false;
    act(() => {
      result.current.view.onFolder('fa');
    });
    act(() => {
      result.current.view.onResumeOpen();
    });
    await waitFor(() => {
      expect(result.current.view.state.more).toBeDefined();
    });
    act(() => {
      result.current.view.onResumeMore();
      result.current.view.onResumeMore();
    });
    await waitFor(() => {
      expect(result.current.view.state.loadingResumable).toBe(false);
    });
    expect(result.current.view.state.resumable).toHaveLength(1);
  });

  it('starts on a device, and reads nothing again after a refusal it has no words for', async () => {
    const startOnDevice = vi.fn<SessionChangeViewModel['startOnDevice']>((_request, _done, refused) => {
      refused(new Error('plain'));
    });
    const seen: string[] = [];
    traffic.onRequest((request) => {
      seen.push(request.url);
    });
    db.devices = [{ id: 'dev-a', name: 'Alpha', daemon: { online: true, lastSeenAt: AT } }];
    const { result } = await form(changeOf({ startOnDevice }));
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.canCreate).toBe(true);
    });
    expect(result.current.view.state.deviceResumes).toBe(false);
    act(() => {
      result.current.view.onResumeOpen();
    });
    expect(result.current.view.state.resumeOpen).toBe(false);
    const before = seen.length;
    act(() => {
      result.current.view.create();
    });
    expect(startOnDevice).toHaveBeenCalledTimes(1);
    expect(startOnDevice.mock.calls[0]?.[0]).toMatchObject({
      deviceId: 'dev-a',
      folderId: 'fa',
      name: 'alpha-web',
    });
    await delay(50);
    expect(seen).toHaveLength(before);
  });
  it('counts only the last devices read, and keeps the folders loading meanwhile', async () => {
    const devicesSeen: string[] = [];
    traffic.onRequest((request) => {
      if (request.url.endsWith('/devices')) devicesSeen.push(request.url);
    });
    server.use(
      handleListDevices(async () => {
        await delay(40);
        return HttpResponse.json({ items: db.devices });
      }),
      handleListDeviceFolders(async ({ params }) => {
        await delay(40);
        return HttpResponse.json({
          deviceId: params.id,
          daemon: ONLINE,
          folders: db.deviceFolders[params.id] ?? [],
        });
      }),
    );
    const { result } = await form();
    // The first read cancelled before any answer, then twice at once: the first of those is dropped before it asks.
    act(() => {
      result.current.view.loadDevices();
    });
    await delay(10);
    act(() => {
      result.current.view.loadDevices();
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.devices).toHaveLength(2);
    });
    expect(result.current.view.state.error).toBeUndefined();
    expect(devicesSeen).toHaveLength(2);
    act(() => {
      result.current.view.onDevice('dev-b');
    });
    expect(result.current.view.state.loadingFolders).toBe(true);
    // Read again while the folders and then the devices load: the read in flight is cancelled, its failure unsaid.
    act(() => {
      result.current.view.loadDevices();
    });
    expect(result.current.view.state.loadingFolders).toBe(true);
    await delay(10);
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.folders).toHaveLength(2);
    });
    expect(devicesSeen).toHaveLength(4);
    expect(result.current.view.state.deviceId).toBe('dev-b');
    expect(result.current.view.state.error).toBeUndefined();
    expect(result.current.view.state.loadingDevices).toBe(false);
  });

  it('drops the conversation chosen once a read from the first page no longer lists it', async () => {
    db.devices = [{ id: 'dev-a', name: 'Alpha', daemon: ONLINE }];
    const { result } = await form();
    act(() => {
      result.current.view.loadDevices();
    });
    await waitFor(() => {
      expect(result.current.view.state.folderId).toBe('fa');
    });
    act(() => {
      result.current.view.onResumeOpen();
    });
    await waitFor(() => {
      expect(result.current.view.state.resumable).toHaveLength(1);
    });
    act(() => {
      result.current.view.onResume('r1');
    });
    expect(result.current.view.state.resumeId).toBe('r1');
    db.resumable['dev-a/fa'] = [{ id: 'r2', title: 'Two', lastActiveAt: AT, turns: 2 }];
    act(() => {
      result.current.view.onResumeRetry();
    });
    await waitFor(() => {
      expect(result.current.view.state.resumable?.map((item) => item.id)).toEqual(['r2']);
    });
    expect(result.current.view.state.resumeId).toBeUndefined();
  });
});
