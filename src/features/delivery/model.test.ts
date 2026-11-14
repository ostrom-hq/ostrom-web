// SPDX-License-Identifier: Apache-2.0
import type { Member } from '@gen/api/types.gen';
import {
  candidatesOf,
  choiceOf,
  decisionsById,
  factsOf,
  memberLabel,
  printable,
  statusTone,
  whoIs,
} from './model';

const maya: Member = { id: 'm-1', login: 'maya', name: 'Maya Lind', avatarUrl: '', role: 'admin' };
const theo: Member = { id: 'm-2', login: 'theo', avatarUrl: '', role: 'member' };
const jo: Member = { id: 'm-3', login: 'jo', avatarUrl: '', role: 'invited' };

describe('decisions', () => {
  it('keeps the explicit Yes and No by member, and ignores a decision it does not know', () => {
    const decided = decisionsById([
      { memberId: 'm-1', decision: 'allow', updatedAt: '2026-11-01T00:00:00Z' },
      { memberId: 'm-2', decision: 'deny', updatedAt: '2026-11-01T00:00:00Z' },
      { memberId: 'm-3', decision: 'maybe', updatedAt: '2026-11-01T00:00:00Z' },
    ]);
    expect([...decided]).toEqual([
      ['m-1', 'allow'],
      ['m-2', 'deny'],
    ]);
  });

  it('reads a select value as Yes, No or no decision', () => {
    expect([choiceOf('allow'), choiceOf('deny'), choiceOf('none'), choiceOf('other')]).toEqual([
      'allow',
      'deny',
      'none',
      'none',
    ]);
  });
});

describe('people', () => {
  it('names a member by their name and login, or by their login alone', () => {
    expect(memberLabel(maya)).toBe('Maya Lind (maya)');
    expect(memberLabel(theo)).toBe('theo');
    expect(memberLabel({ ...theo, name: '' })).toBe('theo');
  });

  it('names whom an id is, else the id itself', () => {
    expect(whoIs('m-1', [maya, theo])).toBe('Maya Lind (maya)');
    expect(whoIs('gone', [maya, theo])).toBe('gone');
    expect(whoIs('m-1', undefined)).toBe('m-1');
  });

  it('leaves out the invited, who have no account yet', () => {
    expect(candidatesOf([maya, jo, theo])).toEqual([maya, theo]);
    expect(candidatesOf(undefined)).toEqual([]);
  });
});

describe('a hook definition', () => {
  it('lists its events sorted, with its matcher and its timeout', () => {
    expect(
      factsOf({ events: ['Stop', 'PreToolUse'], matcher: 'Bash', command: 'run.sh', timeoutSeconds: 5 }),
    ).toEqual({ events: 'PreToolUse, Stop', matcher: 'Bash', command: 'run.sh', timeoutSeconds: 5 });
  });

  it('says 60 seconds when it gives no timeout, and no matcher when it has none', () => {
    expect(factsOf({ events: ['Stop'], command: 'run.sh' })).toEqual({
      events: 'Stop',
      matcher: undefined,
      command: 'run.sh',
      timeoutSeconds: 60,
    });
    expect(factsOf({ events: ['Stop'], matcher: null, command: 'run.sh' }).matcher).toBeUndefined();
  });
});

/** A text as base64 of its UTF-8 bytes, as a file's content travels. */
function base64Of(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

describe('a file read before pinning', () => {
  it('is shown as text when it is UTF-8 with only line breaks and tabs', () => {
    expect(printable(base64Of('#!/bin/sh\r\n\techo "é"\n'))).toBe('#!/bin/sh\r\n\techo "é"\n');
  });

  it('is not shown when it is not base64, not UTF-8, or holds a control character', () => {
    expect(printable('***')).toBeUndefined();
    expect(printable('//4=')).toBeUndefined();
    expect(printable(btoa('a\u0000b'))).toBeUndefined();
    expect(printable(btoa('a\u007fb'))).toBeUndefined();
  });
});

describe('an installation status', () => {
  it('is green when installed, grey when removed, red otherwise', () => {
    expect([
      statusTone('installed'),
      statusTone('removed'),
      statusTone('failed'),
      statusTone('conflict'),
    ]).toEqual(['success', 'neutral', 'danger', 'danger']);
  });
});
