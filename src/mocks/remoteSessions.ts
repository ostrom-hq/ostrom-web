// SPDX-License-Identifier: Apache-2.0
import { handleListDeviceFolders, handleListResumableSessions } from '@gen/api/msw.gen';
import type {
  ApiError,
  CloudSessionResponse,
  DeviceFolderDto,
  DeviceResponse,
  ResumableSessionDto,
} from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { refusal } from '@/mocks/http';

export interface RemoteSessionsState {
  /** The person's devices (`GET /devices`), with their daemon's presence. */
  devices: DeviceResponse[];
  /** The folders each device's daemon published, by device id. */
  deviceFolders: Record<string, DeviceFolderDto[]>;
  /** The Claude Code conversations of a folder, by `<device id>/<folder id>`, the most recent first. */
  resumable: Record<string, ResumableSessionDto[]>;
}

const PAGE = 20;

/** The device of the person, or the server's refusal: unknown, or its daemon offline. */
function onlineDevice(
  state: RemoteSessionsState,
  id: string,
): { readonly device: DeviceResponse } | { readonly refused: HttpResponse<ApiError> } {
  const device = state.devices.find((item) => item.id === id);
  if (device === undefined)
    return { refused: refusal(404, 'device_not_found', 'Not one of the caller’s devices.') };
  if (device.daemon?.online !== true)
    return { refused: refusal(409, 'device_offline', 'The device’s daemon is offline.') };
  return { device };
}

/** A device's folders and the conversations of one, as `DevicesApi` of ostrom-server serves them. */
export function createRemoteSessionsHandlers(state: () => RemoteSessionsState): HttpHandler[] {
  return [
    handleListDeviceFolders(({ params }) => {
      const device = state().devices.find((item) => item.id === params.id);
      if (device === undefined) return refusal(404, 'device_not_found', 'Not one of the caller’s devices.');
      return HttpResponse.json({
        deviceId: device.id,
        daemon: device.daemon ?? null,
        folders: state().deviceFolders[device.id] ?? [],
      });
    }),
    handleListResumableSessions(({ params, request }) => {
      const found = onlineDevice(state(), params.id);
      if ('refused' in found) return found.refused;
      if (found.device.daemon?.features?.includes('resume.v1') !== true)
        return refusal(409, 'daemon_resume_unsupported', 'The daemon cannot list conversations.');
      const search = new URL(request.url).searchParams;
      const limit = Number(search.get('limit') ?? PAGE);
      const before = search.get('before');
      const older = (state().resumable[`${params.id}/${params.folderId}`] ?? []).filter(
        (item) => before === null || item.lastActiveAt <= before,
      );
      const items = older.slice(0, limit);
      return HttpResponse.json({
        items,
        // The cursor is the first conversation of the next page.
        next: older[limit]?.lastActiveAt ?? null,
      });
    }),
  ];
}

/** What a start on a device sends (`kind: remote`). */
export interface RemoteStart {
  readonly agent: string;
  readonly name?: string | null | undefined;
  readonly deviceId?: string | null | undefined;
  readonly folderId?: string | null | undefined;
  readonly permissionMode?: string | null | undefined;
  readonly model?: string | null | undefined;
}

/**
 * A session on one of the person's devices, as the server creates it: waiting for its device to start it. The device
 * must be the person's, its daemon online, and the folder one it published.
 */
export function startRemote(
  state: RemoteSessionsState,
  sent: RemoteStart,
  owner: string,
  id: string,
  at: string,
): CloudSessionResponse | HttpResponse<ApiError> {
  const found = onlineDevice(state, sent.deviceId ?? '');
  if ('refused' in found) return found.refused;
  const { device } = found;
  const folder = (state.deviceFolders[device.id] ?? []).find((item) => item.id === sent.folderId);
  if (folder === undefined)
    return refusal(409, 'folder_not_published', 'The device does not offer this folder.');
  return {
    id,
    name: sent.name ?? folder.name,
    owner,
    agent: sent.agent,
    ...(sent.model === undefined || sent.model === null ? {} : { model: sent.model }),
    status: 'queued',
    desiredStatus: 'running',
    phase: 'waiting_host',
    epoch: 0,
    limits: { idleTimeoutMinutes: 60, maxRunMinutes: 480, restrictedEgress: false },
    createdAt: at,
    updatedAt: at,
    mode: 'conversation',
    kind: 'remote',
    host: {
      deviceId: device.id,
      deviceName: device.name,
      platform: device.platform ?? null,
      osVersion: device.osVersion ?? null,
      directoryName: folder.name,
      online: true,
      permissionMode: sent.permissionMode ?? 'ask',
      folderId: folder.id,
    },
  };
}
