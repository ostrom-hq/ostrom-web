// SPDX-License-Identifier: AGPL-3.0-only
import type { ImportReport } from '@gen/api/types.gen';
import { changesOf, countsOf, parseExport, queryOf, summarize } from './model';

const full = {
  members: [
    { id: 'tc-1', username: 'maya' },
    { id: 'tc-2', username: 'ghost' },
  ],
  mcpServers: [
    {
      id: 'v-1',
      target: 'linear',
      variant: 'default',
      perMember: false,
      url: 'https://mcp.linear.app/mcp',
      credentialHeader: 'Authorization',
      sharedSecret: 's3cret',
      toolMode: 'deny',
      tools: ['delete_issue'],
    },
    {
      id: 'v-2',
      target: 'fs',
      variant: 'default',
      stdio: { launcher: 'npm', packageName: 'fs@1.0.0', args: ['--ro'], secretEnv: { FS_KEY: 'k' } },
    },
    { id: 'v-3', target: 'bare', variant: 'default', stdio: { launcher: 'pypi', packageName: 'x==1' } },
  ],
  assignments: [
    { memberId: 'tc-1', serverId: 'v-1', memberSecret: 'mine' },
    { memberId: 'tc-2', serverId: 'v-1' },
  ],
  accounts: [
    {
      provider: 'claude',
      providerAccountId: 'acc-1',
      label: 'Team Claude',
      email: 'team@acme.dev',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: '2027-01-01T00:00:00Z',
      disabled: false,
    },
    {
      provider: 'codex',
      providerAccountId: 'acc-2',
      label: 'Team Codex',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: '2027-01-01T00:00:00Z',
    },
  ],
  memberMap: { 'tc-1': 'm-1' },
};

describe('parseExport', () => {
  it('reads an export as the contract request, absent fields left out', () => {
    expect(parseExport(JSON.stringify(full))).toEqual({ request: full });
    expect(parseExport('{}')).toEqual({ request: {} });
  });

  it('says when the file is not JSON, or not an export', () => {
    expect(parseExport('{nope')).toEqual({ problem: 'json' });
    expect(parseExport('{"mcpServers":[{"id":1}]}')).toEqual({ problem: 'shape' });
  });
});

describe('summarize', () => {
  it('counts what the file holds and names the members it cannot map', () => {
    const parsed = parseExport(JSON.stringify(full));
    if (!('request' in parsed)) throw new Error('not parsed');
    expect(summarize(parsed.request)).toEqual({
      members: 2,
      servers: 3,
      assignments: 2,
      accounts: 2,
      unmapped: ['ghost'],
    });
    expect(summarize({})).toEqual({ members: 0, servers: 0, assignments: 0, accounts: 0, unmapped: [] });
  });
});

describe('the runs', () => {
  it('asks a plan, a real run, then the cutover', () => {
    expect([queryOf('dryRun'), queryOf('import'), queryOf('cutover')]).toEqual([
      { dryRun: true },
      {},
      { cutover: true },
    ]);
  });

  it('counts each action, and the changes a run writes', () => {
    const report: ImportReport = {
      items: [
        { kind: 'server', name: 'a', action: 'planned' },
        { kind: 'server', name: 'b', action: 'created' },
        { kind: 'server', name: 'c', action: 'updated' },
        { kind: 'server', name: 'd', action: 'unchanged' },
        { kind: 'assignment', name: 'e', action: 'skipped', reason: 'why' },
        { kind: 'account', name: 'f', action: 'revive_at_cutover' },
      ],
      created: 1,
      updated: 1,
      unchanged: 1,
      skipped: 1,
      reviveAtCutover: 1,
    };
    expect(countsOf(report)).toEqual({
      planned: 1,
      created: 1,
      updated: 1,
      unchanged: 1,
      skipped: 1,
      revive_at_cutover: 1,
    });
    expect(changesOf(report)).toBe(3);
  });
});
