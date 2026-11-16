// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse } from '@gen/api/types.gen';
import {
  hostOffline,
  hostRefused,
  isPaused,
  isRemote,
  refusalReason,
  systemOf,
  waitingForHost,
} from './remote';

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

describe('a remote session (TeamCode CloudSession)', () => {
  it('is remote only when the server says so: no kind is a cloud session', () => {
    expect(isRemote(session())).toBe(false);
    expect(isRemote(session({ kind: 'local' }))).toBe(false);
    expect(isRemote(remote())).toBe(true);
  });

  it('is offline or refused by its device only for a remote session', () => {
    const offline = { code: 'host_offline', message: 'gone' };
    const refused = { code: 'host_refused', message: 'refused (folder_missing).' };
    expect(hostOffline(remote({ failure: offline }))).toBe(true);
    expect(hostOffline(session({ failure: offline }))).toBe(false);
    expect(hostOffline(remote())).toBe(false);
    expect(hostRefused(remote({ failure: refused }))).toBe(true);
    expect(hostRefused(session({ failure: refused }))).toBe(false);
  });

  it('waits for its device while active, not once paused or over', () => {
    expect(waitingForHost(remote({ phase: 'waiting_host', status: 'queued' }))).toBe(true);
    expect(waitingForHost(remote({ phase: 'waiting_host', status: 'paused' }))).toBe(false);
    expect(waitingForHost(remote({ phase: 'waiting_host', endedAt: '2026-11-16T10:00:00Z' }))).toBe(false);
    expect(waitingForHost(remote({ phase: 'cloning_repositories' }))).toBe(false);
    expect(waitingForHost(session({ phase: 'waiting_host' }))).toBe(false);
  });

  it('is paused while pausing too', () => {
    expect(isPaused(session({ status: 'pausing' }))).toBe(true);
    expect(isPaused(session({ status: 'paused' }))).toBe(true);
    expect(isPaused(session())).toBe(false);
  });
});

describe('the refusal reason (TeamCode CloudMapping.refusalReason)', () => {
  it('keeps the last short snake_case code in parentheses, nothing else', () => {
    expect(refusalReason('The device refused to start this session (folder_missing).')).toBe(
      'folder_missing',
    );
    expect(refusalReason('(a) then (agent_unsupported)')).toBe('agent_unsupported');
    expect(refusalReason('No code (Not A Code).')).toBeUndefined();
    expect(refusalReason('')).toBeUndefined();
  });
});

describe('the device and its system (TeamCode SessionComponents)', () => {
  it('words the system as its vendor does, with its version', () => {
    expect(systemOf('macos', '26.1')).toBe('macOS 26.1');
    expect(systemOf('windows', undefined)).toBe('Windows');
    expect(systemOf('linux', ' ')).toBe('Linux');
    expect(systemOf('ios', null)).toBe('iOS');
    expect(systemOf('android', '16')).toBe('Android 16');
    expect(systemOf('haiku', 'R1')).toBe('haiku R1');
    expect(systemOf(undefined, '1')).toBeUndefined();
    expect(systemOf(null, '1')).toBeUndefined();
  });
});
