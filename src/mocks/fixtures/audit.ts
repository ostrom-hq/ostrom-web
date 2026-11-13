// SPDX-License-Identifier: Apache-2.0
import type { AuditEvent } from '@gen/api/types.gen';

/** Acme's audit log, newest first, as `GET /audit` lists it: more than a page, so the demo shows the next one. */
export function initialAudit(): AuditEvent[] {
  return [
    {
      id: 'aud-07',
      at: '2026-10-30T07:40:00.000Z',
      event: 'budget.changed',
      actor: 'theo',
      subject: 'budget:organization',
      meta: { monthlyUsd: '500', alerts: '50,80', credential: 'browser' },
    },
    {
      id: 'aud-06',
      at: '2026-10-30T07:10:00.000Z',
      event: 'model_policy.changed',
      actor: 'theo',
      subject: 'policy:models',
      meta: { allowed: 'claude-opus-5-5,claude-sonnet-5', credential: 'browser' },
    },
    {
      id: 'aud-05',
      at: '2026-10-29T18:02:00.000Z',
      event: 'mcp_server.created',
      actor: 'maya',
      subject: 'mcp_server:linear',
      meta: { credential: 'api_token' },
    },
    {
      id: 'aud-04',
      at: '2026-10-29T16:45:00.000Z',
      event: 'member.role_changed',
      actor: 'theo',
      subject: 'member:samir',
      meta: { from: 'member', to: 'admin' },
    },
    {
      id: 'aud-03',
      at: '2026-10-29T09:30:00.000Z',
      event: 'member.joined',
      actor: 'samir',
      subject: 'member:samir',
    },
    {
      id: 'aud-02',
      at: '2026-10-28T15:12:00.000Z',
      event: 'invitation.created',
      actor: 'theo',
      subject: 'invitation:samir@acme.dev',
      meta: { role: 'member' },
    },
    {
      id: 'aud-01',
      at: '2026-10-28T15:00:00.000Z',
      event: 'org.created',
      actor: 'theo',
      subject: 'org:acme',
    },
  ];
}
