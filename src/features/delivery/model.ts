// SPDX-License-Identifier: Apache-2.0
import type { Assignment, HookDefinition, Member } from '@gen/api/types.gen';

/** A member's explicit decision on a skill or a hook, as the server writes it: `allow` is the Yes, `deny` the No. */
export type Decision = 'allow' | 'deny';

/** What a member's row holds: a decision, or `none` for no explicit decision (the audience decides). */
export type DecisionChoice = Decision | 'none';

function isDecision(value: string): value is Decision {
  return value === 'allow' || value === 'deny';
}

/** The choice a select value stands for; anything but Yes and No is no explicit decision. */
export function choiceOf(value: string): DecisionChoice {
  return isDecision(value) ? value : 'none';
}

/** The explicit decisions by member id; any other value the server may send later reads as no decision. */
export function decisionsById(assignments: readonly Assignment[]): ReadonlyMap<string, Decision> {
  const decided = new Map<string, Decision>();
  for (const assignment of assignments) {
    if (isDecision(assignment.decision)) decided.set(assignment.memberId, assignment.decision);
  }
  return decided;
}

/** "Maya Lind (maya)", or the login alone. */
export function memberLabel(member: Member): string {
  return member.name === undefined || member.name === '' ? member.login : `${member.name} (${member.login})`;
}

/** Whom a member id names: the member, else the id itself (the members are unreadable, or the person left). */
export function whoIs(id: string, members: readonly Member[] | undefined): string {
  const known = members?.find((member) => member.id === id);
  return known === undefined ? id : memberLabel(known);
}

/** An invitation not accepted yet has no account a skill or a hook could reach. */
export function candidatesOf(members: readonly Member[] | undefined): readonly Member[] {
  return (members ?? []).filter((member) => member.role !== 'invited');
}

/** The definition of a hook on one line of facts: its events, its matcher, its command and its timeout. */
export interface DefinitionFacts {
  /** The events, sorted, as the digest lists them. */
  readonly events: string;
  readonly matcher: string | undefined;
  readonly command: string;
  /** 60 seconds when the definition does not say, as the server defaults. */
  readonly timeoutSeconds: number;
}

export const DEFAULT_TIMEOUT_SECONDS = 60;

export function factsOf(definition: HookDefinition): DefinitionFacts {
  return {
    events: [...definition.events].sort().join(', '),
    matcher: definition.matcher ?? undefined,
    command: definition.command,
    timeoutSeconds: definition.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
  };
}

/** A file's text when it is printable (UTF-8, no control character but line breaks and tabs), else undefined. */
export function printable(contentBase64: string): string | undefined {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code < 32 && code !== 10 && code !== 13 && code !== 9) || (code >= 127 && code < 160))
      return undefined;
  }
  return text;
}

/** An installation's status as a badge: installed is fine, removed is neutral, anything else is a problem to look at. */
export function statusTone(status: string): 'success' | 'neutral' | 'danger' {
  if (status === 'installed') return 'success';
  return status === 'removed' ? 'neutral' : 'danger';
}
