// SPDX-License-Identifier: AGPL-3.0-only
import type { McpServer, Secret } from '@gen/api/types.gen';
import { checkServer, isHttpsUrl, isTransport, missingSecrets, parseNames } from './model';

describe('isHttpsUrl', () => {
  it('accepts https only', () => {
    expect([isHttpsUrl('https://a.dev/mcp'), isHttpsUrl('http://a.dev'), isHttpsUrl('not a url')]).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('isTransport', () => {
  it('knows http and sse', () => {
    expect([isTransport('http'), isTransport('sse'), isTransport('stdio')]).toEqual([true, true, false]);
  });
});

describe('parseNames', () => {
  it('splits on commas and spaces, without blanks or repeats', () => {
    expect(parseNames(' A, B  C,A ')).toEqual(['A', 'B', 'C']);
    expect(parseNames('')).toEqual([]);
  });
});

describe('checkServer', () => {
  const draft = {
    name: ' linear ',
    url: ' https://mcp.linear.app/sse ',
    transport: 'sse' as const,
    secrets: 'LINEAR_TOKEN',
  };
  it('builds the server to send, trimmed and on', () => {
    expect(checkServer(draft)).toEqual({
      server: {
        name: 'linear',
        url: 'https://mcp.linear.app/sse',
        transport: 'sse',
        secretNames: ['LINEAR_TOKEN'],
        enabled: true,
        scope: 'org',
      },
    });
  });
  it('says what is wrong, in the order the form reads', () => {
    expect(checkServer({ ...draft, name: 'Linear' })).toEqual({ problem: 'name' });
    expect(checkServer({ ...draft, url: 'http://x' })).toEqual({ problem: 'url' });
    expect(checkServer({ ...draft, secrets: 'OK, bad' })).toEqual({ problem: 'secret', detail: 'bad' });
  });
});

describe('missingSecrets', () => {
  it('lists what the server needs and the organization lacks', () => {
    const server: McpServer = {
      name: 'a',
      url: 'https://a',
      transport: 'http',
      secretNames: ['HAVE', 'LACK'],
      enabled: true,
      scope: 'org',
    };
    const secrets: Secret[] = [
      { name: 'HAVE', scope: 'org', createdAt: '', updatedAt: '', updatedBy: 'maya' },
    ];
    expect(missingSecrets(server, secrets)).toEqual(['LACK']);
  });
});
