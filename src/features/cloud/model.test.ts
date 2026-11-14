// SPDX-License-Identifier: Apache-2.0
import type { Automation, CloudProfile, CloudSession } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { zCloudAgentKind } from '@gen/api/zod.gen';
import { knownValues } from '@/shared/lib/openEnum';
import {
  imageAllowed,
  startRefusalOf,
  accessOf,
  CLOUD_AGENTS,
  idempotencyKey,
  isCancellable,
  isCloudAgent,
  isPromptAgent,
  PROMPT_AGENTS,
  isKnownRunReason,
  isKnownRunStatus,
  isCloudStatus,
  isLive,
  isWebhook,
  mayChange,
  sessionTitle,
  sessionTone,
  versionedUrl,
} from './model';

const session = (parts: Partial<CloudSession>): CloudSession => ({
  id: 'cs-1',
  owner: 'maya',
  agent: 'codex',
  status: 'running',
  createdAt: '2026-10-30T00:00:00.000Z',
  ...parts,
});

describe('cloud sessions', () => {
  it('knows the agents it can start', () => {
    // The contract's names (CloudAgentKind), as the server reads them: claude-code was never one.
    expect(CLOUD_AGENTS).toEqual(knownValues(zCloudAgentKind));
    expect([isCloudAgent('codex'), isCloudAgent('claude-code'), isCloudAgent('shell')]).toEqual([
      true,
      false,
      true,
    ]);
    // The console starts the agents that follow a prompt: the contract's but the plain shell.
    expect(PROMPT_AGENTS).toEqual(knownValues(zCloudAgentKind).filter((agent) => agent !== 'shell'));
    expect([isPromptAgent('gemini'), isPromptAgent('shell'), isPromptAgent('claude-code')]).toEqual([
      true,
      false,
      false,
    ]);
  });
  it('has words for the statuses it knows', () => {
    expect([isCloudStatus('running'), isCloudStatus('paused')]).toEqual([true, false]);
  });
  it('is live while queued, starting or running', () => {
    expect(
      ['queued', 'starting', 'running', 'ended', 'stopped'].map((status) => isLive(session({ status }))),
    ).toEqual([true, true, true, false, false]);
  });
  it('colours the status, never in garnet', () => {
    expect(['running', 'failed', 'queued', 'starting', 'ended'].map(sessionTone)).toEqual([
      'success',
      'danger',
      'warning',
      'warning',
      'neutral',
    ]);
  });
  it('is named by its name, else by its agent and id', () => {
    expect(sessionTitle(session({ name: 'Fix' }))).toBe('Fix');
    expect(sessionTitle(session({}))).toBe('codex · cs-1');
  });
  it('lets its owner or a manager change it', () => {
    expect([
      mayChange('maya', 'maya', false),
      mayChange('theo', 'maya', true),
      mayChange('theo', 'maya', false),
    ]).toEqual([true, true, false]);
  });
});

describe('isWebhook', () => {
  it('tells a webhook trigger from a schedule', () => {
    const automation = (kind: 'cron' | 'webhook'): Automation => ({
      id: 'a',
      name: 'A',
      owner: 'maya',
      enabled: true,
      trigger: { kind },
      action: {},
      version: 1,
      createdAt: '',
      updatedAt: '',
    });
    expect([isWebhook(automation('webhook')), isWebhook(automation('cron'))]).toEqual([true, false]);
  });
});

describe('runs', () => {
  it('knows the run states and reasons it has words for', () => {
    expect([isKnownRunStatus('queued'), isKnownRunStatus('toString'), isKnownRunStatus('x')]).toEqual([
      true,
      false,
      false,
    ]);
    expect([isKnownRunReason('owner_unavailable'), isKnownRunReason('x')]).toEqual([true, false]);
  });

  it('makes a fresh 128-bit key for each gesture', () => {
    const first = idempotencyKey();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(idempotencyKey()).not.toBe(first);
  });
});

describe('the GitHub access of a session', () => {
  it('reads the server’s word, and the default, the owner only, when it sent none', () => {
    expect(accessOf(session({ githubAccess: 'shared' }))).toBe('shared');
    expect(accessOf(session({ githubAccess: 'none' }))).toBe('none');
    expect(accessOf(session({}))).toBe('owner');
  });
});

describe('an automation run that can be cancelled', () => {
  it('is queued or started', () => {
    expect(['queued', 'started', 'failed', 'succeeded', 'cancelled'].map(isCancellable)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('versionedUrl', () => {
  const url = 'https://api.ostrom.run/api/v1/automations/au-1/trigger';
  it('pins the latest version or the current one', () => {
    expect(versionedUrl(url, 'latest', 4)).toBe(
      'https://api.ostrom.run/api/v1/automations/au-1/v/latest/trigger',
    );
    expect(versionedUrl(url, 'current', 4)).toBe(
      'https://api.ostrom.run/api/v1/automations/au-1/v/4/trigger',
    );
  });
  it('gives nothing for an address that is not a trigger', () => {
    expect(versionedUrl('https://x.io/hook', 'latest', 1)).toBeUndefined();

describe('the image a session may run', () => {
  const profile = (allowed: string[]): CloudProfile => ({
    id: 'p',
    name: 'p',
    version: 1,
    spec: { clusterId: 'c', namespace: 'n', image: 'img:1', allowedImageOverrides: allowed },
    assignedMemberIds: [],
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  });

  it('is the profile’s own, or one an override matches, with * for any run of characters', () => {
    const open = profile(['ghcr.io/acme/*:latest', 'a*b*c', 'exact']);
    expect(imageAllowed('', open)).toBe(true);
    expect(imageAllowed(' img:1 ', open)).toBe(true);
    expect(imageAllowed('ghcr.io/acme/web:latest', open)).toBe(true);
    expect(imageAllowed('exact', open)).toBe(true);
    expect(imageAllowed('axxbyyc', open)).toBe(true);
    expect(imageAllowed('abc', open)).toBe(true);
    expect(imageAllowed('ac', open)).toBe(false);
    expect(imageAllowed('acb', open)).toBe(false);
    expect(imageAllowed('ghcr.io/acme/web:1', open)).toBe(false);
    expect(imageAllowed('exactly', open)).toBe(false);
    expect(imageAllowed('other', profile([]))).toBe(false);
    const { allowedImageOverrides, ...plain } = open.spec;
    expect(allowedImageOverrides).toHaveLength(3);
    expect(imageAllowed('x', { ...open, spec: plain })).toBe(false);
  });

  it('knows the refusals of a start that have their own words', () => {
    expect(startRefusalOf(new ApiFailure('forbidden', 'x', 403, undefined, 'profile_unassigned'))).toBe(
      'profile_unassigned',
    );
    expect(startRefusalOf(new ApiFailure('conflict', 'x', 409, undefined, 'namespace_not_allowed'))).toBe(
      'namespace_not_allowed',
    );
    expect(startRefusalOf(new ApiFailure('server', 'x', 500, undefined, 'internal'))).toBeUndefined();
    expect(startRefusalOf(new Error('x'))).toBeUndefined();
  });
});
