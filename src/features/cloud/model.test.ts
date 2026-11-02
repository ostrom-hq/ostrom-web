// SPDX-License-Identifier: AGPL-3.0-only
import type { Automation, CloudSession } from '@gen/api/types.gen';
import { zCloudAgentKind } from '@gen/api/zod.gen';
import {
  CLOUD_AGENTS,
  idempotencyKey,
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
    expect(CLOUD_AGENTS).toEqual(zCloudAgentKind.options);
    expect([isCloudAgent('codex'), isCloudAgent('claude-code'), isCloudAgent('shell')]).toEqual([
      true,
      false,
      true,
    ]);
    // The console starts the agents that follow a prompt: the contract's but the plain shell.
    expect(PROMPT_AGENTS).toEqual(zCloudAgentKind.options.filter((agent) => agent !== 'shell'));
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
