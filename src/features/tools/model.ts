// SPDX-License-Identifier: AGPL-3.0-only
import type { McpServer, Secret } from '@gen/api/types.gen';

/** The name an agent calls the server by: lowercase, digits and dashes, as the server routes it. */
export const MCP_SERVER_NAME = /^[a-z][a-z0-9-]{0,39}$/;
/** A secret is an environment variable in the agent's sandbox. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
export const TRANSPORTS = ['http', 'sse'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export function isTransport(value: string): value is Transport {
  return TRANSPORTS.some((transport) => transport === value);
}

/** The relay only reaches servers over TLS. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Splits "A, B  C" into names, without blanks or repeats. */
export function parseNames(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((name) => name !== ''))];
}

export interface ServerDraft {
  readonly name: string;
  readonly url: string;
  readonly transport: Transport;
  readonly secrets: string;
}

export type ServerDraftProblem = 'name' | 'url' | 'secret';

/** What stops the server from being added, in the order the form reads, or the server to send. */
export function checkServer(
  draft: ServerDraft,
): { readonly problem: ServerDraftProblem; readonly detail?: string } | { readonly server: McpServer } {
  const name = draft.name.trim();
  if (!MCP_SERVER_NAME.test(name)) return { problem: 'name' };
  const url = draft.url.trim();
  if (!isHttpsUrl(url)) return { problem: 'url' };
  const secretNames = parseNames(draft.secrets);
  const wrong = secretNames.find((secret) => !SECRET_NAME.test(secret));
  if (wrong !== undefined) return { problem: 'secret', detail: wrong };
  return { server: { name, url, transport: draft.transport, secretNames, enabled: true, scope: 'org' } };
}

/** The secrets a server needs that the organization does not have: its calls fail until they exist. */
export function missingSecrets(server: McpServer, secrets: readonly Secret[]): string[] {
  return server.secretNames.filter((name) => !secrets.some((secret) => secret.name === name));
}
