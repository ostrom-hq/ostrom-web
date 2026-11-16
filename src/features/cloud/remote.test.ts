// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse, DeviceResponse } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { hostName, hostNotice, refusalText } from '@/features/cloudHost';
import { i18n } from '@/shared/i18n/i18n';
import { deviceFailureText, whereOf } from './deviceWords';
import './wording';
import {
  daemonResumes,
  deviceGone,
  deviceProblemOf,
  hostDevices,
  isDeviceAgent,
  isPermissionMode,
  kindsQuery,
  kindsSearch,
  listedKinds,
  sortedFolders,
} from './remote';

const refused = (code: string): ApiFailure => new ApiFailure('conflict', `raw ${code}`, 409, undefined, code);

describe('the kinds listed (TeamCode cloud list --kind)', () => {
  it('lists both kinds for All, one otherwise, never local', () => {
    expect(listedKinds('all')).toEqual(['cloud', 'remote']);
    expect(listedKinds('cloud')).toEqual(['cloud']);
    expect(listedKinds('remote')).toEqual(['remote']);
  });

  it('repeats kind once per kind, and names the kinds in the query key', () => {
    expect(kindsSearch(['cloud', 'remote'])).toBe('kind=cloud&kind=remote');
    expect(kindsSearch(['remote'])).toBe('kind=remote');
    const options = kindsQuery(['cloud', 'remote']);
    expect(options.query).toEqual({ kind: 'cloud,remote' });
    const serializer = options.querySerializer;
    expect(typeof serializer === 'function' ? serializer({}) : undefined).toBe('kind=cloud&kind=remote');
  });
});

describe('the devices and folders a session starts on (TeamCode DeviceSessionUseCases)', () => {
  const device = (change: Partial<DeviceResponse>): DeviceResponse => ({
    id: 'dev',
    name: 'Device',
    daemon: { online: true, lastSeenAt: '2026-11-16T09:00:00Z' },
    ...change,
  });

  it('offers only online devices, this one first, then by name and id', () => {
    const devices = [
      device({ id: 'd-off', name: 'Alpha', daemon: { online: false, lastSeenAt: '2026-11-16T09:00:00Z' } }),
      device({ id: 'd-none', name: 'Alpha', daemon: null }),
      device({ id: 'd-z', name: 'zed' }),
      device({ id: 'd-b2', name: 'beta' }),
      device({ id: 'd-b1', name: 'Beta' }),
      device({ id: 'd-me', name: 'Yours', current: true }),
    ];
    expect(hostDevices(devices).map((item) => item.id)).toEqual(['d-me', 'd-b1', 'd-b2', 'd-z']);
  });

  it('sorts folders by their label, else their name, then id', () => {
    const folders = sortedFolders([
      { id: 'f3', name: 'web' },
      { id: 'f2', name: 'api', label: 'Zeta' },
      { id: 'f1', name: 'b' },
      { id: 'f0', name: 'B' },
    ]);
    expect(folders.map((folder) => folder.id)).toEqual(['f0', 'f1', 'f3', 'f2']);
  });

  it('knows a daemon that lists conversations', () => {
    expect(daemonResumes({ online: true, lastSeenAt: '', features: ['resume.v1'] })).toBe(true);
    expect(daemonResumes({ online: true, lastSeenAt: '' })).toBe(false);
    expect(daemonResumes(null)).toBe(false);
  });

  it('knows the agents and the permission modes', () => {
    expect(isDeviceAgent('codex')).toBe(true);
    expect(isDeviceAgent('opencode')).toBe(false);
    expect(isPermissionMode('bypass')).toBe(true);
    expect(isPermissionMode('yolo')).toBe(false);
    expect(isPermissionMode(null)).toBe(false);
  });
});

describe('the refusals about a device (TeamCode error_device_*)', () => {
  const t = i18n.getFixedT('en');

  it('reads a known code, the daemon’s older word and a folder reason', () => {
    expect(deviceProblemOf(refused('device_offline'))).toEqual({ kind: 'refusal', code: 'device_offline' });
    expect(deviceProblemOf(refused('daemon_resume_unsupported'))).toEqual({
      kind: 'refusal',
      code: 'resume_unsupported',
    });
    expect(deviceProblemOf(refused('folder_missing'))).toEqual({ kind: 'folder', code: 'folder_missing' });
    expect(deviceProblemOf(refused('invalid_resume'))).toBeUndefined();
    expect(deviceProblemOf(new ApiFailure('network', 'down', undefined, undefined))).toBeUndefined();
    expect(deviceProblemOf(new Error('plain'))).toBeUndefined();
    expect(deviceProblemOf(undefined)).toBeUndefined();
  });

  it('drops a device gone offline or removed, not one that refused otherwise', () => {
    expect(deviceGone({ kind: 'refusal', code: 'device_offline' })).toBe(true);
    expect(deviceGone({ kind: 'refusal', code: 'device_not_found' })).toBe(true);
    expect(deviceGone({ kind: 'refusal', code: 'folder_not_published' })).toBe(false);
    expect(deviceGone({ kind: 'folder', code: 'folder_missing' })).toBe(false);
    expect(deviceGone(undefined)).toBe(false);
  });

  it('words each refusal, and leaves any other failure as the server wrote it', () => {
    expect(deviceFailureText(t, refused('device_no_answer'))).toBe(
      'The device did not answer in time. Try again.',
    );
    expect(deviceFailureText(t, refused('folder_moved'))).toBe(
      'The device could not read this folder’s sessions (folder_moved).',
    );
    expect(deviceFailureText(t, refused('invalid_resume'))).toBe('raw invalid_resume');
  });
});

describe('the words of a remote session’s device (TeamCode SessionComponents)', () => {
  const t = i18n.getFixedT('en');
  const session = (change: Partial<CloudSessionResponse> = {}): CloudSessionResponse => ({
    id: 'cs-1',
    name: 'Fix it',
    owner: 'maya',
    agent: 'claude',
    status: 'running',
    desiredStatus: 'running',
    epoch: 1,
    limits: { idleTimeoutMinutes: 60, maxRunMinutes: 480, restrictedEgress: false },
    createdAt: '2026-11-16T09:00:00Z',
    updatedAt: '2026-11-16T09:00:00Z',
    ...change,
  });
  const remote = (change: Partial<CloudSessionResponse> = {}): CloudSessionResponse =>
    session({
      kind: 'remote',
      host: { deviceId: 'dev-1', deviceName: 'Ada’s Mac', online: true },
      ...change,
    });

  it('words a known reason, an unknown one and none', () => {
    const refused = (message: string) => remote({ failure: { code: 'host_refused', message } });
    expect(refusalText(t, refused('x (folder_missing)'))).toBe(
      'Ada’s Mac refused to start this session: the folder no longer exists on the device.',
    );
    expect(refusalText(t, refused('x (disk_full)'))).toBe(
      'Ada’s Mac refused to start this session: it gave the reason disk_full.',
    );
    expect(refusalText(t, refused('x'))).toBe('Ada’s Mac refused to start this session: it gave no reason.');
    expect(refusalText(t, remote())).toBe('Ada’s Mac refused to start this session: it gave no reason.');
  });
  it('names the device, a removed one and an unnamed one', () => {
    expect(hostName(t, { deviceId: 'dev-1', deviceName: 'Ada’s Mac' })).toBe('Ada’s Mac');
    expect(hostName(t, { deviceId: 'dev-1', deviceName: ' ' })).toBe('unnamed device');
    expect(hostName(t, { deviceId: 'dev-1' })).toBe('unnamed device');
    expect(hostName(t, { deviceId: null, deviceName: 'Ada’s Mac' })).toBe('removed device');
    expect(hostName(t, {})).toBe('removed device');
    expect(hostName(t, null)).toBe('removed device');
    expect(hostName(t, undefined)).toBe('removed device');
  });

  it('says where a session runs', () => {
    expect(whereOf(t, session())).toBe('Cloud');
    expect(whereOf(t, remote())).toBe('Remote · Ada’s Mac');
  });

  it('gives the sentence of an offline, a waiting and a refused session, none otherwise', () => {
    expect(hostNotice(t, remote({ failure: { code: 'host_offline', message: '' } }))?.tone).toBe('warning');
    expect(hostNotice(t, remote({ phase: 'waiting_host' }))?.tone).toBe('info');
    expect(hostNotice(t, remote({ failure: { code: 'host_refused', message: '' } }))?.tone).toBe('danger');
    expect(hostNotice(t, remote())).toBeUndefined();
  });
});
