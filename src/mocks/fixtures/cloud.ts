// SPDX-License-Identifier: AGPL-3.0-only
import type { Automation, AutomationRun, CloudSession, Runner } from '@gen/api/types.gen';

const sessions: CloudSession[] = [
  {
    id: 'cs-31',
    name: 'Fix the flaky invoice test',
    owner: 'maya',
    agent: 'claude',
    model: 'claude-sonnet-5',
    status: 'running',
    runnerId: 'rn-1',
    createdAt: '2026-10-30T07:42:00.000Z',
  },
  {
    id: 'cs-30',
    owner: 'theo',
    agent: 'codex',
    status: 'queued',
    automationId: 'au-nightly',
    createdAt: '2026-10-30T07:55:00.000Z',
  },
  {
    id: 'cs-27',
    name: 'Upgrade the API client',
    owner: 'theo',
    agent: 'claude',
    status: 'ended',
    runnerId: 'rn-2',
    createdAt: '2026-10-29T16:10:00.000Z',
    endedAt: '2026-10-29T16:58:00.000Z',
  },
  {
    id: 'cs-25',
    owner: 'samir',
    agent: 'codex',
    status: 'failed',
    createdAt: '2026-10-29T11:00:00.000Z',
    endedAt: '2026-10-29T11:03:00.000Z',
  },
];

const runners: Runner[] = [
  {
    id: 'rn-1',
    name: 'eu-west-1a',
    labels: ['linux', 'x64', 'docker'],
    status: 'online',
    lastSeenAt: '2026-10-30T07:59:30.000Z',
    version: '0.4.2',
  },
  {
    id: 'rn-2',
    name: 'mac-studio',
    labels: ['macos', 'arm64'],
    status: 'offline',
    lastSeenAt: '2026-10-29T22:15:00.000Z',
  },
];

const automations: Automation[] = [
  {
    id: 'au-nightly',
    name: 'Nightly dependency upgrades',
    owner: 'theo',
    enabled: true,
    trigger: { kind: 'cron', cron: '0 3 * * 1-5', timezone: 'Europe/Paris' },
    action: {
      prompt: 'Upgrade the dependencies that have a patch release and open one PR.',
      agent: 'codex',
      maxRuntimeMinutes: 45,
    },
    overlap: 'skip',
    maxRunsPerDay: 1,
    version: 4,
    createdAt: '2026-10-12T09:00:00.000Z',
    updatedAt: '2026-10-28T17:20:00.000Z',
  },
  {
    id: 'au-sentry',
    name: 'Triage new Sentry issues',
    owner: 'maya',
    enabled: false,
    trigger: { kind: 'webhook' },
    action: { workflowId: 'wf-backend' },
    samplePayload: { issue: { id: 'SENTRY-1', title: 'TypeError in invoice.ts' } },
    webhookUrl: 'https://api.ostrom.run/api/v1/automations/au-sentry/trigger',
    version: 1,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
  },
];

const runs: AutomationRun[] = [
  {
    id: 'run-88',
    automationId: 'au-nightly',
    source: 'cron',
    status: 'started',
    version: 4,
    sessionId: 'cs-88',
    problems: [],
    slotAt: '2026-10-30T02:00:00.000Z',
    createdAt: '2026-10-30T02:00:00.000Z',
    updatedAt: '2026-10-30T02:00:05.000Z',
  },
  {
    id: 'run-81',
    automationId: 'au-nightly',
    source: 'cron',
    status: 'failed',
    version: 3,
    reason: 'cloud_hours_exhausted',
    problems: [],
    slotAt: '2026-10-29T02:00:00.000Z',
    createdAt: '2026-10-29T02:00:00.000Z',
    updatedAt: '2026-10-29T02:00:02.000Z',
  },
];

export function initialCloudSessions(): CloudSession[] {
  return structuredClone(sessions);
}
export function initialRunners(): Runner[] {
  return structuredClone(runners);
}
export function initialAutomations(): Automation[] {
  return structuredClone(automations);
}
export function initialAutomationRuns(): AutomationRun[] {
  return structuredClone(runs);
}
