// SPDX-License-Identifier: Apache-2.0
import type {
  ActivityItem,
  Budget,
  OrgMember,
  Rule,
  Session,
  Spending,
  SpendingLine,
} from '@gen/api/types.gen';
import { groupId } from '@/mocks/groups';
import type { MockDb } from '@/mocks/handlers';

/**
 * A large organization, for the console's performance pass (PERF-CONSOLE): 500 members in 50 groups, 2 000 rules,
 * 10 000 lines of activity, 300 sessions, and the spending of all 500. The demo opens on it when the browser's
 * `ostrom.mock.scale` is `large`; nothing else reads it.
 */
export const LARGE = {
  members: 500,
  groups: 50,
  rules: 2_000,
  activity: 10_000,
  sessions: 300,
  /** Sessions still running among the 300: more than one page of the server's (50). */
  openSessions: 60,
  repos: 40,
} as const;

/** Where the large organization's history ends. */
const NOW = Date.parse('2026-10-30T08:00:00.000Z');
const MINUTE = 60_000;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function largeLogin(n: number): string {
  return `dev-${pad(n, 3)}`;
}

export function largeRepo(n: number): string {
  return `acme/service-${pad(n % LARGE.repos, 2)}`;
}

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * MINUTE).toISOString();
}

/** A member's id, a UUID as the server writes it, the number of the member at its end. */
export function largeMemberId(n: number): string {
  return `00000000-0000-4000-8000-${pad(n, 12)}`;
}

export function largeMembers(): OrgMember[] {
  return Array.from({ length: LARGE.members }, (_, n) => ({
    id: largeMemberId(n),
    login: largeLogin(n),
    name: `Developer ${pad(n, 3)}`,
    avatarUrl: '',
    email: `${largeLogin(n)}@acme.test`,
    role: n % 50 === 0 ? 'admin' : 'member',
    joinedAt: at(60 * 24 * (n + 1)),
  }));
}

/** 50 groups of ten members each, every member in one. */
export function largeGroupMembers(group: number): string[] {
  return Array.from({ length: LARGE.members / LARGE.groups }, (_, n) =>
    largeLogin(group * (LARGE.members / LARGE.groups) + n),
  );
}

/** 40 areas of 50 rules each. */
const RULE_GROUPS = 40;

/** By group then id, as the server lists them: built in that order. */
export function largeRules(): Rule[] {
  return Array.from({ length: LARGE.rules }, (_, n): Rule => {
    const repo = largeRepo(n);
    const group = Math.floor(n / (LARGE.rules / RULE_GROUPS));
    return {
      id: `R-L${pad(n, 4)}`,
      statement: `Changes to ${repo} follow convention number ${String(n)} of the organization.`,
      why: `Seen in ${String(3 + (n % 40))} merged pull requests of ${repo} over the last 90 days.`,
      output: n % 3 === 0 ? 'gate' : n % 3 === 1 ? 'check' : 'note',
      group: `Area ${pad(group, 2)}`,
      scope: [repo],
      strength: n % 3 === 0 ? 'required' : 'recommended',
      confidence: 0.5 + (n % 50) / 100,
      status: n % 3 === 0 ? 'proposed' : n % 3 === 1 ? 'accepted' : 'rejected',
      foundBy: 'deep-pass',
      foundAt: at(n),
    };
  });
}

/** Newest first, a line a minute: sessions started and ended, yeses asked for and given. */
export function largeActivity(): ActivityItem[] {
  return Array.from({ length: LARGE.activity }, (_, n): ActivityItem => {
    const dev = largeLogin(n % LARGE.members);
    const repo = largeRepo(n);
    const session = `ses-l${pad(n, 5)}`;
    switch (n % 4) {
      case 0:
        return {
          id: `session.started:${session}`,
          at: at(n),
          kind: 'session.started',
          actor: { kind: 'agent', name: 'claude-code' },
          summary: `${dev} started a claude-code session in ${repo}`,
          repo,
          sessionId: session,
        };
      case 1:
        return {
          id: `session.ended:${session}`,
          at: at(n),
          kind: 'session.ended',
          actor: { kind: 'agent', name: 'codex' },
          summary: `${dev}'s codex session in ${repo} ended`,
          repo,
          costUsd: (n % 700) / 100,
          sessionId: session,
        };
      case 2:
        return {
          id: `gate.requested:apr-l${pad(n, 5)}`,
          at: at(n),
          kind: 'gate.requested',
          actor: { kind: 'agent', name: 'claude-code' },
          summary: `claude-code asked for a yes: deploy ${repo}`,
          repo,
        };
      default:
        return {
          id: `workflow.changed:wf-l${pad(n, 5)}`,
          at: at(n),
          kind: 'workflow.changed',
          actor: { kind: 'person', name: dev },
          summary: `${dev} changed the release workflow of ${repo}`,
        };
    }
  });
}

/** Newest first; the first 60 still running. */
export function largeSessions(): Session[] {
  return Array.from({ length: LARGE.sessions }, (_, n): Session => {
    const started = at(10 * n + 5);
    return {
      id: `ses-l${pad(n, 4)}`,
      agent: n % 2 === 0 ? 'claude-code' : 'codex',
      dev: largeLogin(n % LARGE.members),
      devVerified: true,
      devVia: 'github',
      repo: largeRepo(n),
      model: 'claude-opus-5-5',
      startedAt: started,
      lastSeenAt: at(10 * n),
      tools: 20 + (n % 200),
      costUsd: (n % 900) / 100,
      ...(n < LARGE.openSessions ? {} : { endedAt: at(10 * n), endedBy: 'SessionEnd' }),
    };
  });
}

/** A monthly limit for each member. */
export function largeBudgets(): Budget[] {
  return Array.from({ length: LARGE.members }, (_, n) => ({
    scope: 'member',
    subject: largeLogin(n),
    usdPerMonth: 100 + (n % 5) * 50,
    hardStop: n % 2 === 0,
  }));
}

/** Every one of the 500 spent something, in 40 repositories. */
export function largeSpending(period: 'month' | 'week'): Spending {
  const scale = period === 'month' ? 4 : 1;
  const line = (key: string, label: string, usd: number, sessions: number): SpendingLine => ({
    key,
    label,
    usd: Math.round(usd * scale * 100) / 100,
    sessions: sessions * scale,
  });
  const byPerson = Array.from({ length: LARGE.members }, (_, n) =>
    line(largeLogin(n), `Developer ${pad(n, 3)}`, 1 + ((n * 37) % 400) / 10, 1 + (n % 9)),
  ).sort((a, b) => b.usd - a.usd);
  const byRepo = Array.from({ length: LARGE.repos }, (_, n) =>
    line(largeRepo(n), largeRepo(n), 20 + ((n * 53) % 300), 10 + n),
  ).sort((a, b) => b.usd - a.usd);
  const totalUsd = Math.round(byPerson.reduce((sum, item) => sum + item.usd, 0) * 100) / 100;
  const days = period === 'month' ? 30 : 7;
  return {
    period,
    from: at(60 * 24 * days),
    to: at(0),
    totalUsd,
    byAgent: [
      line('claude-code', 'Claude Code', (totalUsd * 0.7) / scale, 900),
      line('codex', 'Codex', (totalUsd * 0.3) / scale, 400),
    ],
    byRepo,
    byPerson,
    daily: Array.from({ length: days }, (_, n) => ({
      date: at(60 * 24 * (days - n)).slice(0, 10),
      usd: Math.round((totalUsd / days) * 100) / 100,
    })),
  };
}

/** The demo's organization made large: its own lines replaced, or joined by the large ones where they are few. */
export function growLarge(db: MockDb): void {
  const org = db.organization.id;
  db.orgMembers[org] = [...(db.orgMembers[org] ?? []), ...largeMembers()];
  db.groups = [
    ...db.groups,
    ...Array.from({ length: LARGE.groups }, (_, n) => ({
      id: groupId(db.nextGroup + n),
      orgId: org,
      name: `Team ${pad(n, 2)}`,
      members: largeGroupMembers(n),
      accounts: [],
      pauses: [],
    })),
  ];
  db.nextGroup += LARGE.groups;
  db.rules = largeRules();
  db.activity = largeActivity();
  db.activityPage = 50;
  db.sessions = largeSessions();
  db.budgets = [...db.budgets, ...largeBudgets()];
  db.spending = largeSpending;
}
