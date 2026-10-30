// SPDX-License-Identifier: AGPL-3.0-only
import type { McpCall, McpServer, Secret } from '@gen/api/types.gen';

const servers: McpServer[] = [
  {
    name: 'linear',
    url: 'https://mcp.linear.app/sse',
    transport: 'sse',
    secretNames: ['LINEAR_TOKEN'],
    tools: ['list_issues', 'create_issue', 'update_issue'],
    enabled: true,
    scope: 'org',
  },
  {
    name: 'sentry',
    url: 'https://mcp.sentry.dev/mcp',
    transport: 'http',
    enabled: false,
    scope: 'team:billing',
  },
];

const secrets: Secret[] = [
  {
    name: 'LINEAR_TOKEN',
    scope: 'org',
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-10-27T14:30:00.000Z',
    updatedBy: 'maya',
    version: 3,
    usedBy: ['mcp:linear'],
  },
  {
    name: 'STRIPE_TEST_KEY',
    scope: 'team:billing',
    createdAt: '2026-10-22T10:00:00.000Z',
    updatedAt: '2026-10-22T10:00:00.000Z',
    updatedBy: 'samir',
    version: 1,
  },
];

const calls: McpCall[] = [
  {
    id: 'call-3',
    at: '2026-10-30T07:58:00.000Z',
    server: 'linear',
    tool: 'create_issue',
    dev: 'theo',
    sessionId: 'ses-7f3a',
    durationMs: 412,
    ok: true,
  },
  {
    id: 'call-2',
    at: '2026-10-30T07:40:00.000Z',
    server: 'linear',
    tool: 'list_issues',
    dev: 'maya',
    ok: false,
  },
  {
    id: 'call-1',
    at: '2026-10-30T07:10:00.000Z',
    server: 'linear',
    tool: 'list_issues',
    dev: 'theo',
    durationMs: 98,
    ok: true,
  },
];

export function initialMcpServers(): McpServer[] {
  return structuredClone(servers);
}

export function initialSecrets(): Secret[] {
  return structuredClone(secrets);
}

/** Newest first. */
export function initialMcpCalls(): McpCall[] {
  return structuredClone(calls);
}
