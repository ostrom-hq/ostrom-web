// SPDX-License-Identifier: Apache-2.0
import {
  listDeviceFoldersOptions,
  listDevicesOptions,
  listResumableSessionsOptions,
} from '@gen/api/@tanstack/react-query.gen';
import type { DeviceFolderDto, DeviceResponse, ResumableSessionDto } from '@gen/api/types.gen';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import { safeLocalStorage } from '@/shared/lib/safeStorage';
import {
  daemonResumes,
  type DeviceAgent,
  deviceGone,
  deviceProblemOf,
  hostDevices,
  isPermissionMode,
  type PermissionMode,
  sortedFolders,
} from './remote';
import type { SessionChangeViewModel } from './useCloud';

/** Where the last launch's permission mode is kept, for the next one. */
export const PERMISSION_MODE_KEY = 'ostrom.cloud.permissionMode';

/** How many conversations a page of the resume picker holds. */
const RESUMABLE_PAGE = 20;

/** The device form, as TeamCode's companion `NewSessionUiState` holds its device part. */
export interface DeviceFormState {
  /** The member's devices whose daemon is online; undefined until they were read. */
  readonly devices: readonly DeviceResponse[] | undefined;
  readonly loadingDevices: boolean;
  readonly deviceId: string | undefined;
  /** The chosen device's folders; undefined until they were read. */
  readonly folders: readonly DeviceFolderDto[] | undefined;
  readonly loadingFolders: boolean;
  readonly folderId: string | undefined;
  /** The chosen device's daemon lists the folder's conversations; false for an older Ostrom there. */
  readonly deviceResumes: boolean;
  /** The folder's conversations, read when the picker first opens; undefined until then. */
  readonly resumable: readonly ResumableSessionDto[] | undefined;
  /** The cursor of the next, older page and what it adds to; undefined on the last one. */
  readonly more: { readonly before: string; readonly shown: readonly ResumableSessionDto[] } | undefined;
  readonly loadingResumable: boolean;
  /** Why the conversations could not be read, shown in the picker; the form can still start a new conversation. */
  readonly resumableError: Error | undefined;
  readonly resumeOpen: boolean;
  /** The conversation the session continues; undefined, the default, starts a new one. */
  readonly resumeId: string | undefined;
  readonly agent: DeviceAgent;
  readonly permissionMode: PermissionMode;
  readonly name: string;
  /** False until the member types a name: the folder's name follows the chosen folder. */
  readonly nameEdited: boolean;
  readonly model: string;
  readonly effort: string;
  readonly message: string;
  readonly error: Error | undefined;
}

export interface DeviceStartViewModel {
  readonly state: DeviceFormState;
  /** The picker shows once a folder is chosen, for Claude Code only, where the server resumes sessions. */
  readonly showsResume: boolean;
  readonly canCreate: boolean;
  readonly creating: boolean;
  readonly loadDevices: () => void;
  readonly onDevice: (id: string) => void;
  readonly onFolder: (id: string) => void;
  readonly onAgent: (agent: DeviceAgent) => void;
  readonly onPermissionMode: (mode: PermissionMode) => void;
  readonly onName: (value: string) => void;
  readonly onModel: (value: string) => void;
  readonly onEffort: (value: string) => void;
  readonly onMessage: (value: string) => void;
  readonly onResumeOpen: () => void;
  readonly onResumeRetry: () => void;
  readonly onResumeMore: () => void;
  readonly onResume: (id: string | undefined) => void;
  readonly create: () => void;
}

function initialState(): DeviceFormState {
  const stored = safeLocalStorage.getItem(PERMISSION_MODE_KEY);
  return {
    devices: undefined,
    loadingDevices: false,
    deviceId: undefined,
    folders: undefined,
    loadingFolders: false,
    folderId: undefined,
    deviceResumes: false,
    resumable: undefined,
    more: undefined,
    loadingResumable: false,
    resumableError: undefined,
    resumeOpen: false,
    resumeId: undefined,
    agent: 'claude',
    permissionMode: isPermissionMode(stored) ? stored : 'ask',
    name: '',
    nameEdited: false,
    model: '',
    effort: '',
    message: '',
    error: undefined,
  };
}

/** No conversation chosen; `list` also forgets the conversations read, which belong to another folder. */
function withoutResume(state: DeviceFormState, list: boolean): DeviceFormState {
  return {
    ...state,
    resumeId: undefined,
    resumeOpen: false,
    ...(list
      ? { resumable: undefined, more: undefined, loadingResumable: false, resumableError: undefined }
      : {}),
  };
}

/**
 * Unless the member named it, the session takes the folder's name, and none without a folder. A conversation belongs
 * to its folder: another folder (or device, which goes through here) clears the choice and the list.
 */
function withFolder(state: DeviceFormState, id: string | undefined): DeviceFormState {
  const folder = state.folders?.find((item) => item.id === id);
  const moved = folder?.id !== state.folderId;
  const next = { ...state, folderId: folder?.id, name: state.nameEdited ? state.name : (folder?.name ?? '') };
  return moved ? withoutResume(next, true) : next;
}

const OFFLINE = (): ApiFailure =>
  new ApiFailure('conflict', 'The device is offline.', 409, undefined, 'device_offline');

/**
 * Starting a session on one of the member's online devices (`runners.cloud.remote.daemon.v1`): TeamCode's companion
 * `NewSessionViewModel`, its device part. The devices are read when the form turns to them and at each Refresh; a device
 * whose daemon went offline is dropped with its folder. The key of a press is the start's own (`useSessionChange`).
 */
export function useDeviceStart(change: SessionChangeViewModel): DeviceStartViewModel {
  const queryClient = useQueryClient();
  const resumes = useAnnounced('runners.cloud.remote.resume.v1');
  const [state, setState] = useState(initialState);
  // What the answers compare with: only the answer for the device and folder still chosen counts.
  const current = useRef(state);
  // As TeamCode's `devicesJob` and `foldersJob`: a new read cancels the one in flight, whose answer no longer counts.
  const devicesRead = useRef(0);
  const foldersRead = useRef(0);
  const update = useCallback((next: (state: DeviceFormState) => DeviceFormState) => {
    current.current = next(current.current);
    setState(current.current);
  }, []);
  /** An edit clears the last refusal; none while a start is on its way, as what it sent is what a retry sends. */
  const edit = useCallback(
    (next: (state: DeviceFormState) => DeviceFormState) => {
      if (change.starting) return;
      update((state) => ({ ...next(state), error: undefined }));
    },
    [change.starting, update],
  );

  const loadFolders = useCallback(
    async (deviceId: string, keepError: boolean) => {
      foldersRead.current += 1;
      const read = foldersRead.current;
      update((state) => ({ ...state, loadingFolders: true, error: keepError ? state.error : undefined }));
      try {
        const options = listDeviceFoldersOptions({ path: { id: deviceId } });
        // A read of the same device in flight is cancelled, not joined: its answer may predate what changed since.
        await queryClient.cancelQueries({ queryKey: options.queryKey });
        if (read !== foldersRead.current) return;
        const found = await queryClient.query(ready(options, { staleTime: 0, retry: false }));
        if (read !== foldersRead.current) return;
        if (found.daemon?.online !== true) throw OFFLINE();
        const folders = sortedFolders(found.folders);
        const kept = folders.some((folder) => folder.id === current.current.folderId)
          ? current.current.folderId
          : folders.length === 1
            ? folders[0]?.id
            : undefined;
        update((state) =>
          withFolder(
            { ...state, folders, loadingFolders: false, deviceResumes: daemonResumes(found.daemon) },
            kept,
          ),
        );
      } catch (error) {
        if (read !== foldersRead.current) return;
        const failure = failureOf(error);
        // The device went offline or is gone: the list no longer offers it. Dropped here without reading the list
        // again, which could still name it (its presence lags) and lead back here.
        update((state) =>
          deviceGone(deviceProblemOf(failure))
            ? withFolder(
                {
                  ...state,
                  devices: state.devices?.filter((device) => device.id !== deviceId),
                  deviceId: undefined,
                  folders: undefined,
                  loadingFolders: false,
                  error: failure,
                },
                undefined,
              )
            : { ...state, loadingFolders: false, folders: state.folders ?? [], error: failure },
        );
      }
    },
    [queryClient, update],
  );

  const reloadDevices = useCallback(
    async (keepError: boolean) => {
      devicesRead.current += 1;
      const read = devicesRead.current;
      // The folders follow the devices: a folder read in flight answers for a list being replaced. Still loading, they
      // are read again once the devices answer.
      foldersRead.current += 1;
      update((state) => ({ ...state, loadingDevices: true, error: keepError ? state.error : undefined }));
      try {
        const options = listDevicesOptions();
        await queryClient.cancelQueries({ queryKey: options.queryKey });
        if (read !== devicesRead.current) return;
        const answer = await queryClient.query(ready(options, { staleTime: 0, retry: false }));
        if (read !== devicesRead.current) return;
        const devices = hostDevices(answer.items);
        const chosen = current.current.deviceId;
        const kept = devices.some((device) => device.id === chosen)
          ? chosen
          : devices.length === 1
            ? devices[0]?.id
            : undefined;
        update((state) =>
          kept === state.deviceId
            ? { ...state, devices, loadingDevices: false, loadingFolders: false }
            : withFolder(
                {
                  ...state,
                  devices,
                  loadingDevices: false,
                  loadingFolders: false,
                  deviceId: kept,
                  folders: undefined,
                },
                undefined,
              ),
        );
        if (kept !== undefined) await loadFolders(kept, keepError);
      } catch (error) {
        if (read !== devicesRead.current) return;
        update((state) => ({
          ...state,
          loadingDevices: false,
          loadingFolders: false,
          error: failureOf(error),
        }));
      }
    },
    [queryClient, update, loadFolders],
  );

  const loadDevices = useCallback(() => {
    if (change.starting) return;
    void reloadDevices(false);
  }, [change.starting, reloadDevices]);

  const onDevice = useCallback(
    (id: string) => {
      const state = current.current;
      if (change.starting || state.devices?.some((device) => device.id === id) !== true) return;
      // The same device again only reads its folders again after they failed.
      if (id === state.deviceId && state.folders !== undefined && state.error === undefined) return;
      edit((state) =>
        withFolder({ ...state, deviceId: id, folders: undefined, deviceResumes: false }, undefined),
      );
      void loadFolders(id, false);
    },
    [change.starting, edit, loadFolders],
  );

  const onFolder = useCallback(
    (id: string) => {
      edit((state) => withFolder(state, id));
    },
    [edit],
  );

  const loadResumable = useCallback(
    async (before: string | undefined, known: readonly ResumableSessionDto[]) => {
      const { deviceId, folderId } = current.current;
      if (deviceId === undefined || folderId === undefined) return;
      update((state) => ({ ...state, loadingResumable: true, resumableError: undefined }));
      try {
        const page = await queryClient.query(
          ready(
            listResumableSessionsOptions({
              path: { id: deviceId, folderId },
              query: { limit: RESUMABLE_PAGE, ...(before === undefined ? {} : { before }) },
            }),
            { staleTime: 0, retry: false },
          ),
        );
        if (current.current.deviceId !== deviceId || current.current.folderId !== folderId) return;
        update((state) => {
          const added = page.items.filter((item) => !known.some((shown) => shown.id === item.id));
          const shown = [...known, ...added];
          const next = page.next ?? undefined;
          return {
            ...state,
            // A conversation no longer listed (read again from the first page) is not sent: the picker says None.
            resumeId: shown.find((item) => item.id === state.resumeId)?.id,
            resumable: shown,
            more: next === undefined ? undefined : { before: next, shown },
            loadingResumable: false,
          };
        });
      } catch (error) {
        if (current.current.deviceId !== deviceId || current.current.folderId !== folderId) return;
        update((state) => ({ ...state, loadingResumable: false, resumableError: failureOf(error) }));
      }
    },
    [queryClient, update],
  );

  const showsResume = resumes && state.folderId !== undefined && state.agent === 'claude';

  const onResumeOpen = useCallback(() => {
    const state = current.current;
    if (change.starting || !showsResume || !state.deviceResumes) return;
    update((state) => ({ ...state, resumeOpen: !state.resumeOpen }));
    if (current.current.resumeOpen && state.resumable === undefined && !state.loadingResumable)
      void loadResumable(undefined, []);
  }, [change.starting, showsResume, update, loadResumable]);

  const onResumeRetry = useCallback(() => {
    if (!current.current.loadingResumable) void loadResumable(undefined, []);
  }, [loadResumable]);

  const onResumeMore = useCallback(() => {
    const { more, loadingResumable } = current.current;
    if (more !== undefined && !loadingResumable) void loadResumable(more.before, more.shown);
  }, [loadResumable]);

  const onResume = useCallback(
    (id: string | undefined) => {
      edit((state) => ({ ...state, resumeId: id, resumeOpen: false }));
    },
    [edit],
  );

  const busy = state.loadingDevices || state.loadingFolders;
  // Not while something loads: its answer can change what is sent.
  const canCreate =
    !change.starting &&
    !busy &&
    state.name.trim() !== '' &&
    state.deviceId !== undefined &&
    state.folderId !== undefined;

  const { startOnDevice } = change;
  const create = useCallback(() => {
    const state = current.current;
    const { deviceId, folderId } = state;
    if (!canCreate || deviceId === undefined || folderId === undefined) return;
    update((state) => ({ ...state, error: undefined }));
    startOnDevice(
      {
        agent: state.agent,
        name: state.name,
        prompt: state.message,
        deviceId,
        folderId,
        permissionMode: state.permissionMode,
        model: state.model,
        effort: state.effort,
        resumeSessionId: showsResume ? state.resumeId : undefined,
      },
      () => {
        // Kept once a session started with it: a refused launch leaves the previous choice.
        safeLocalStorage.setItem(PERMISSION_MODE_KEY, state.permissionMode);
        update((state) =>
          withoutResume({ ...state, message: '', name: '', nameEdited: false, folderId: undefined }, true),
        );
      },
      // Said in the form, by its code, as TeamCode's sheet does; the reads below keep it.
      (error) => {
        const failure = failureOf(error);
        update((state) => ({ ...state, error: failure }));
        const problem = deviceProblemOf(failure);
        if (deviceGone(problem)) void reloadDevices(true);
        else if (problem?.kind === 'refusal' && problem.code === 'folder_not_published')
          void loadFolders(deviceId, true);
      },
    );
  }, [canCreate, showsResume, startOnDevice, update, reloadDevices, loadFolders]);

  return {
    state,
    showsResume,
    canCreate,
    creating: change.starting,
    loadDevices,
    onDevice,
    onFolder,
    // Codex continues no Claude Code conversation: the choice goes with the agent.
    onAgent: useCallback(
      (agent: DeviceAgent) => {
        edit((state) => (agent === state.agent ? state : withoutResume({ ...state, agent }, false)));
      },
      [edit],
    ),
    onPermissionMode: useCallback(
      (permissionMode: PermissionMode) => {
        edit((state) => ({ ...state, permissionMode }));
      },
      [edit],
    ),
    // A name cleared lets the folder name the session again.
    onName: useCallback(
      (name: string) => {
        edit((state) => ({ ...state, name, nameEdited: name.trim() !== '' }));
      },
      [edit],
    ),
    onModel: useCallback(
      (model: string) => {
        edit((state) => ({ ...state, model }));
      },
      [edit],
    ),
    onEffort: useCallback(
      (effort: string) => {
        edit((state) => ({ ...state, effort }));
      },
      [edit],
    ),
    onMessage: useCallback(
      (message: string) => {
        edit((state) => ({ ...state, message }));
      },
      [edit],
    ),
    onResumeOpen,
    onResumeRetry,
    onResumeMore,
    onResume,
    create,
  };
}
