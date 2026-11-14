// SPDX-License-Identifier: Apache-2.0
import type { Webhook, WebhookDelivery } from '@gen/api/types.gen';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

/** The demo organization's webhooks, oldest first: one delivering, one a person paused, one the server disabled. */
export function initialWebhooks(): Webhook[] {
  return [
    {
      id: 'wh-1',
      url: 'https://hooks.acme.dev/ostrom',
      types: ['cloud.wait.cancelled', 'cloud.wait.created', 'cloud.wait.resolved'],
      description: 'Waits to the on-call channel',
      enabled: true,
      createdBy: MEMBER_IDS.maya,
      createdAt: '2026-11-02T09:00:00.000Z',
      updatedAt: '2026-11-02T09:00:00.000Z',
      version: 1,
      consecutiveFailures: 0,
    },
    {
      id: 'wh-2',
      url: 'https://ci.acme.dev/ostrom/runs',
      types: ['cloud.workflow.run.updated'],
      description: '',
      enabled: false,
      disabledReason: 'disabled',
      createdBy: MEMBER_IDS.maya,
      createdAt: '2026-11-05T14:30:00.000Z',
      updatedAt: '2026-11-08T10:00:00.000Z',
      version: 2,
      consecutiveFailures: 0,
    },
    {
      id: 'wh-3',
      url: 'https://old.acme.dev/receiver',
      types: ['cloud.todo'],
      description: 'Retired receiver',
      enabled: false,
      disabledReason: 'too_many_failures',
      createdBy: MEMBER_IDS.maya,
      createdAt: '2026-10-20T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
      version: 3,
      consecutiveFailures: 20,
    },
  ];
}

/** The deliveries of each webhook, newest first. */
export function initialWebhookDeliveries(): Record<string, WebhookDelivery[]> {
  return {
    'wh-1': [
      {
        id: 'wd-3',
        eventSeq: 42,
        eventType: 'cloud.wait.created',
        state: 'pending',
        attempts: 2,
        nextAttemptAt: '2026-11-14T10:02:00.000Z',
        lastStatus: 503,
        createdAt: '2026-11-14T10:00:00.000Z',
        test: false,
      },
      {
        id: 'wd-2',
        eventSeq: 41,
        eventType: 'cloud.wait.resolved',
        state: 'failed',
        attempts: 1,
        lastError: 'timeout',
        createdAt: '2026-11-13T16:20:00.000Z',
        test: false,
      },
      {
        id: 'wd-1',
        eventType: 'webhook.test',
        state: 'delivered',
        attempts: 1,
        lastStatus: 200,
        createdAt: '2026-11-02T09:05:00.000Z',
        deliveredAt: '2026-11-02T09:05:01.000Z',
        test: true,
      },
    ],
  };
}
