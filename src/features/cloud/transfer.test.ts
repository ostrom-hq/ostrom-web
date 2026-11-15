// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse, CloudTransferResponse } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  isOpenTransfer,
  isTransferState,
  mayTransfer,
  memberLabel,
  transferRefusalOf,
  transferTone,
} from './transfer';

const session = (status: string, owner = 'maya'): CloudSessionResponse => ({
  id: 's',
  name: '',
  owner,
  agent: 'claude',
  status,
  desiredStatus: 'running',
  epoch: 1,
  limits: { idleTimeoutMinutes: 30, maxRunMinutes: 60, restrictedEgress: false },
  createdAt: '2026-10-30T07:00:00.000Z',
  updatedAt: '2026-10-30T07:00:00.000Z',
});
const transfer = (state: string): CloudTransferResponse => ({
  id: 't',
  sessionId: 's',
  fromMemberId: 'a',
  toMemberId: 'b',
  state,
  initiatedBy: 'a',
  resume: false,
  createdAt: '2026-10-30T07:00:00.000Z',
  updatedAt: '2026-10-30T07:00:00.000Z',
});

describe('the transfers of a cloud session', () => {
  it('knows the states it has words for', () => {
    expect(isTransferState('offered')).toBe(true);
    expect(isTransferState('lost')).toBe(false);
  });

  it('calls a transfer open while it may still change the owner', () => {
    expect(isOpenTransfer(transfer('offered'))).toBe(true);
    expect(isOpenTransfer(transfer('accepted'))).toBe(true);
    expect(isOpenTransfer(transfer('completed'))).toBe(false);
  });

  it('tones the states', () => {
    expect(transferTone('offered')).toBe('warning');
    expect(transferTone('accepted')).toBe('warning');
    expect(transferTone('completed')).toBe('success');
    expect(transferTone('failed')).toBe('danger');
    expect(transferTone('declined')).toBe('neutral');
  });

  it('lets the owner or a manager give a session that runs or is paused', () => {
    expect(mayTransfer(session('running'), 'maya', false)).toBe(true);
    expect(mayTransfer(session('paused'), 'maya', false)).toBe(true);
    expect(mayTransfer(session('running', 'theo'), 'maya', false)).toBe(false);
    expect(mayTransfer(session('running', 'theo'), 'maya', true)).toBe(true);
    expect(mayTransfer(session('queued'), 'maya', true)).toBe(false);
    expect(mayTransfer(session('transferring'), 'maya', true)).toBe(false);
  });

  it('knows the refusals that have their own words', () => {
    expect(transferRefusalOf(new ApiFailure('forbidden', 'x', 403, undefined, 'transfer_disabled'))).toBe(
      'transfer_disabled',
    );
    expect(transferRefusalOf(new ApiFailure('server', 'x', 500, undefined, 'internal'))).toBeUndefined();
    expect(transferRefusalOf(new Error('x'))).toBeUndefined();
  });

  it('names a member by login, else by the start of their id', () => {
    expect(memberLabel('abc', new Map([['abc', 'maya']]))).toBe('maya');
    expect(memberLabel('0123456789', new Map())).toBe('01234567');
  });
});
