// SPDX-License-Identifier: Apache-2.0
import type { McpAssignment, McpServer, Member, Secret } from '@gen/api/types.gen';
import {
  AGENT_PREFIX,
  agentToolName,
  type AssignmentDraft,
  checkAssignment,
  checkPolicy,
  checkServer,
  EVERYONE,
  isConditionOperator,
  isHttpsUrl,
  isPolicyEffect,
  isToolName,
  formatMemory,
  hostedStateOf,
  hostedTone,
  isTransport,
  memberLabel,
  missingSecrets,
  parseNames,
  type PolicyDraft,
  sortAssignments,
  takesValue,
} from './model';

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
        scope: 'shared',
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
      scope: 'shared',
    };
    const secrets: Secret[] = [
      { name: 'HAVE', scope: 'org', createdAt: '', updatedAt: '', updatedBy: 'maya', version: 1 },
    ];
    expect(missingSecrets(server, secrets)).toEqual(['LACK']);
    const bare: McpServer = {
      name: 'b',
      url: 'https://b',
      transport: 'http',
      enabled: true,
      scope: 'shared',
    };
    expect(missingSecrets(bare, secrets)).toEqual([]);
  });
});

describe('the agent prefix', () => {
  it('is 1 to 32 of a-z 0-9 _ -, starting with a letter or a digit', () => {
    expect(['ostrom', 'a', '9-x_y', 'a'.repeat(32)].every((value) => AGENT_PREFIX.test(value))).toBe(true);
    expect(['', '-a', 'Acme', 'a b', 'a'.repeat(33)].some((value) => AGENT_PREFIX.test(value))).toBe(false);
  });

  it('names a tool as agents see it, dots turned to underscores', () => {
    expect(agentToolName('ostrom', 'linear')).toBe('mcp__ostrom-linear__<tool>');
    expect(agentToolName('acme', 'mcp.dev')).toBe('mcp__acme-mcp_dev__<tool>');
  });
});

describe('checkPolicy', () => {
  const draft: PolicyDraft = { tool: ' create_issue ', effect: 'DENY', message: ' No. ', conditions: [] };

  it('sends a policy with its conditions, without a value for the tests that take none', () => {
    expect(
      checkPolicy({
        ...draft,
        conditions: [
          { path: ' query ', operator: 'CONTAINS', value: 'DROP' },
          { path: 'options.database', operator: 'EXISTS', value: 'ignored' },
        ],
      }),
    ).toEqual({
      request: {
        tool: 'create_issue',
        effect: 'DENY',
        message: 'No.',
        conditions: [
          { path: 'query', operator: 'CONTAINS', value: 'DROP' },
          { path: 'options.database', operator: 'EXISTS' },
        ],
      },
    });
    expect(checkPolicy({ ...draft, tool: '*' })).toEqual({
      request: { tool: '*', effect: 'DENY', message: 'No.', conditions: [] },
    });
  });

  it('says the first problem in the order the form reads', () => {
    expect(checkPolicy({ ...draft, tool: 'a b' })).toEqual({ problem: 'tool' });
    expect(checkPolicy({ ...draft, message: '  ' })).toEqual({ problem: 'message' });
    expect(checkPolicy({ ...draft, message: 'x'.repeat(501) })).toEqual({ problem: 'message' });
    expect(checkPolicy({ ...draft, conditions: [{ path: ' ', operator: 'ABSENT', value: '' }] })).toEqual({
      problem: 'path',
    });
    expect(
      checkPolicy({ ...draft, conditions: [{ path: 'p'.repeat(257), operator: 'EXISTS', value: '' }] }),
    ).toEqual({ problem: 'path' });
    expect(
      checkPolicy({ ...draft, conditions: [{ path: 'q', operator: 'EQUALS', value: 'v'.repeat(1025) }] }),
    ).toEqual({ problem: 'value' });
  });

  it('takes a blank value for a forgotten one', () => {
    expect(checkPolicy({ ...draft, conditions: [{ path: 'q', operator: 'EQUALS', value: '' }] })).toEqual({
      problem: 'value',
    });
  });

  it('knows the operators and the effects', () => {
    expect([isConditionOperator('MATCHES'), isConditionOperator('LIKE')]).toEqual([true, false]);
    expect([takesValue('PREFIX'), takesValue('EXISTS'), takesValue('ABSENT')]).toEqual([true, false, false]);
    expect([isPolicyEffect('REQUIRE_APPROVAL'), isPolicyEffect('ALLOW')]).toEqual([true, false]);
    expect([isToolName('list_issues'), isToolName('*'), isToolName('')]).toEqual([true, false, false]);
  });
});

describe('checkAssignment', () => {
  const draft: AssignmentDraft = {
    member: EVERYONE,
    onlySome: false,
    tools: 'ignored',
    credentialSecret: '',
  };

  it('gives every tool or an allowlist, never an empty one', () => {
    expect(checkAssignment(draft)).toEqual({ member: 'all', request: {} });
    expect(checkAssignment({ ...draft, onlySome: true, tools: 'a, b a' })).toEqual({
      member: 'all',
      request: { tools: ['a', 'b'] },
    });
    expect(checkAssignment({ ...draft, onlySome: true, tools: ' , ' })).toEqual({ problem: 'noTool' });
  });

  it('gives one member their own credential, never everyone', () => {
    expect(checkAssignment({ ...draft, member: ' m-1 ', credentialSecret: ' MY_TOKEN ' })).toEqual({
      member: 'm-1',
      request: { credentialSecret: 'MY_TOKEN' },
    });
    expect(checkAssignment({ ...draft, credentialSecret: 'MY_TOKEN' })).toEqual({
      problem: 'credentialEveryone',
    });
    expect(checkAssignment({ ...draft, member: 'm-1', credentialSecret: 'lower' })).toEqual({
      problem: 'credential',
    });
  });

  it('says whom it lacks and which tool is wrong', () => {
    expect(checkAssignment({ ...draft, member: ' ' })).toEqual({ problem: 'member' });
    expect(checkAssignment({ ...draft, onlySome: true, tools: 'ok, a/b' })).toEqual({
      problem: 'tool',
      detail: 'a/b',
    });
  });
});

describe('sortAssignments and memberLabel', () => {
  it('puts everyone first', () => {
    const one: McpAssignment = { server: 's', member: 'm', assignedAt: 'x' };
    const all: McpAssignment = { server: 's', assignedAt: 'y' };
    expect(sortAssignments([one, all])).toEqual([all, one]);
  });

  it('names a member by name and login, or login alone', () => {
    const member: Member = { id: 'm', login: 'theo', avatarUrl: '', role: 'member' };
    expect(memberLabel(member)).toBe('theo');
    expect(memberLabel({ ...member, name: '' })).toBe('theo');
    expect(memberLabel({ ...member, name: 'Theo B' })).toBe('Theo B (theo)');
  });
});

describe('the hosted process states', () => {
  it('reads a state the host does not document as unknown', () => {
    expect(['ready', 'backoff', 'paused'].map(hostedStateOf)).toEqual(['ready', 'backoff', 'unknown']);
  });

  it('calls ready good, failed bad and a backoff a warning', () => {
    expect(['ready', 'failed', 'backoff', 'idle'].map((state) => hostedTone(hostedStateOf(state)))).toEqual([
      'success',
      'danger',
      'warning',
      'neutral',
    ]);
  });

  it('writes the memory in MiB, then in GiB', () => {
    expect([formatMemory(96 * 1024 * 1024), formatMemory(1536 * 1024 * 1024)]).toEqual(['96 MiB', '1.5 GiB']);
  });
});
