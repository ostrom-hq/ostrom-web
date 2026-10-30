// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';
import { agentLabel, approversOf, askTone, diffLineKind, diffStats, keyIdOf, shortSha } from './model';

const base: Ask = {
  id: 'a',
  status: 'pending',
  title: 'Merge',
  channel: 'console',
  who: {},
  what: {},
  rules: [],
  evidence: [],
  shownDigest: 'sha256:x',
  askedBy: ['theo'],
};

describe('diff', () => {
  const diff = [
    'diff --git a/x b/x',
    '--- a/x',
    '+++ b/x',
    '@@ -1,2 +1,2 @@',
    ' same',
    '-old',
    '+new',
    '+more',
  ].join('\n');

  it('classifies each line', () => {
    expect(diff.split('\n').map(diffLineKind)).toEqual([
      'file',
      'file',
      'file',
      'hunk',
      'context',
      'removed',
      'added',
      'added',
    ]);
  });

  it('counts added and removed lines, not the file headers', () => {
    expect(diffStats(diff)).toEqual({ added: 2, removed: 1 });
  });
});

describe('askTone', () => {
  it('waits for the viewer, or for someone else when the viewer asked', () => {
    expect(askTone(base)).toBe('waiting-you');
    expect(askTone({ ...base, you: { login: 'theo', self: true, canApprove: false } })).toBe('waiting-other');
    expect(askTone({ ...base, you: { login: 'theo', self: true, canApprove: true } })).toBe('waiting-you');
  });

  it('names the decided states', () => {
    expect(askTone({ ...base, status: 'approved' })).toBe('approved');
    expect(askTone({ ...base, status: 'rejected' })).toBe('refused');
    expect(askTone({ ...base, status: 'expired' })).toBe('expired');
  });
});

describe('approversOf', () => {
  it('sets the author aside when another approver exists', () => {
    expect(approversOf({ ...base, gate: { label: 'g', approvers: ['Theo', 'maya'] } })).toEqual({
      eligible: ['maya'],
      askers: ['Theo'],
    });
  });

  it('keeps the author when nobody else can approve', () => {
    expect(approversOf({ ...base, gate: { label: 'g', approvers: ['theo'] } })).toEqual({
      eligible: ['theo'],
      askers: [],
    });
  });

  it('has nobody without a gate', () => {
    expect(approversOf(base)).toEqual({ eligible: [], askers: [] });
  });
});

describe('labels', () => {
  it('names known agents and keeps unknown ones', () => {
    expect(agentLabel('claude-code')).toBe('Claude Code');
    expect(agentLabel('aider')).toBe('aider');
    expect(agentLabel(undefined)).toBeUndefined();
  });

  it('shortens a sha', () => {
    expect(shortSha('9c1e4b2a7d')).toBe('9c1e4b2');
  });

  it('reads the key id of a signature', () => {
    expect(keyIdOf('ed25519;kid=4f2a9c1b;sha256=0c;sig=ME')).toBe('4f2a9c1b');
    expect(keyIdOf('ed25519;sha256=0c')).toBeUndefined();
  });
});

describe('actionKind', () => {
  it('names the action for the approve button', () => {
    expect(actionKind({ ...base, what: { action: 'Merge a pull request' } })).toBe('merge');
    expect(actionKind({ ...base, what: { command: 'make deploy ENV=prod' } })).toBe('deployment');
    expect(actionKind({ ...base, title: 'git push origin main' })).toBe('push');
    expect(actionKind({ ...base, title: 'Run the migration' })).toBe('other');
  });
});
