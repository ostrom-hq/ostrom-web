// SPDX-License-Identifier: AGPL-3.0-only
import type { GitHubLink, OrgMember, Repo } from '@gen/api/types.gen';
import { z } from 'zod/mini';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { apiUrl } from '@/shared/api/apiClient';
import { safeHref } from '@/shared/lib/safeHref';

/** The error types of GitHub's web link callback (`githubLinkCallback`), which the console puts in words. */
export const LINK_ERRORS = [
  'github_link_not_found',
  'github_link_browser_mismatch',
  'github_link_denied',
  'github_account_in_use',
  'github_app_not_configured',
  'github_unreachable',
] as const;

/**
 * What GitHub's install and web link bring back, through the server's callbacks: `/github?installed=1`,
 * `/github?linked=1`, or `/github?error=<type>`. The address never carries free text: an error is a type, put in
 * words by the console.
 */
export const githubSearchSchema = z.object({
  linked: z.optional(
    z.pipe(
      z.unknown(),
      z.transform((value) => value === 1 || value === '1' || value === true),
    ),
  ),
  installed: z.optional(
    z.pipe(
      z.unknown(),
      // `1` as the server sends it; `true` once read, as the router validates its own output again.
      z.transform((value) => value === 1 || value === '1' || value === true),
    ),
  ),
  // A type the console words, or `unknown`: never the text of the address.
  error: z.catch(
    z.optional(z.enum(['denied', 'expired', 'forbidden', ...LINK_ERRORS, 'unknown'])),
    'unknown',
  ),
});
export type GithubSearch = z.infer<typeof githubSearchSchema>;

/** What the install brought back, kept for the page's life once the address is cleaned. */
export interface InstallOutcome {
  readonly installed: boolean;
  /** A GitHub account was linked, for the person or for a member they linked. */
  readonly linked: boolean;
  readonly error: InstallError | undefined;
}

/** The error types of the install the console puts in its own words; any other reads as `unknown`. */
export type InstallError = NonNullable<GithubSearch['error']>;

/** When a repository was last pushed, for sorting: never pushed, or not a date, sorts last. */
function pushedTime(repo: Repo): number {
  const time = repo.pushedAt === undefined ? Number.NaN : Date.parse(repo.pushedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** The repositories whose name or description holds every word typed: live ones first, then the latest pushed. */
export function reposShown(repos: readonly Repo[], query: string): Repo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return repos
    .filter((repo) => {
      const text = `${repo.name} ${repo.description ?? ''}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      const [first, second] = [pushedTime(a), pushedTime(b)];
      if (first !== second) return second > first ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Where the analysis is. `never`: the organization was never analysed. `running`: a run goes on (`connect`, then the
 * engine's phases). `ready` and `failed`: the last run is over.
 */
export type AnalysisStage = 'never' | 'running' | 'ready' | 'failed';

/** The stages a run can start from: none while one runs. */
export type AnalysisRunStage = Exclude<AnalysisStage, 'running'>;

export function stageOf(state: { readonly phase?: string | undefined }): AnalysisStage {
  switch (state.phase) {
    case undefined:
      return 'never';
    case 'ready':
      return 'ready';
    case 'failed':
      return 'failed';
    default:
      return 'running';
  }
}

/** A running analysis is read again this often. */
export const ANALYSIS_POLL_MS = 2_000;
/** After a passing failure (a server error, the network, a rate limit, a route missing midway), the next read waits this long. */
export const ANALYSIS_RETRY_MS = 15_000;

/**
 * The answers worth reading again: the server or the network failing, a timeout, a rate limit, and a route missing
 * while the server deploys (404). Any other refusal (a lost session or right, a bad request, a conflict) stays the same
 * however often it is asked.
 */
function passes(status: number | undefined): boolean {
  return status === undefined || status >= 500 || [404, 408, 425, 429].includes(status);
}

/**
 * How long until the analysis is read again: only while a run goes on. A failing read is said on the page; a passing
 * one slows the poll down, so a blip never freezes a run the server finishes, and any other refusal stops it.
 */
export function analysisPollDelay(
  state: { readonly phase?: string | undefined } | undefined,
  error: unknown,
): number | false {
  if (state === undefined || stageOf(state) !== 'running') return false;
  if (error === null || error === undefined) return ANALYSIS_POLL_MS;
  return passes(isApiFailure(error) ? error.status : undefined) ? ANALYSIS_RETRY_MS : false;
}

/**
 * Where the browser goes to install the App on an organization, or to change its repositories. A navigation sends no
 * `Ostrom-Org` header, so the organization rides in the query (`?org=`), which the server checks as it would the
 * header; the session cookie stays the proof of who asks.
 */
export function installUrl(org: string): string {
  return `${apiUrl('/api/v1/github/app/install/start')}?${new URLSearchParams({ org }).toString()}`;
}

/** The App's page on GitHub, only when it is an https link: the server's word is still outside data. */
export function safeAppPage(url: string | undefined): string | undefined {
  const href = safeHref(url);
  return href?.startsWith('https:') === true ? href : undefined;
}

/** A date people read ("Oct 29, 2026"), or nothing when the server sent no valid date. */
export function readableDate(iso: string, language: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Where the browser goes to link the caller's own GitHub account: a navigation, so the organization rides in the query. */
export function linkUrl(org: string): string {
  return `${apiUrl('/api/v1/github/link/start')}?${new URLSearchParams({ org }).toString()}`;
}

/** Where an owner or an admin starts the link of another member (a service account), in the administrator's browser. */
export function memberLinkUrl(org: string, memberId: string): string {
  return `${apiUrl(`/api/v1/github/links/${encodeURIComponent(memberId)}/start`)}?${new URLSearchParams({ org }).toString()}`;
}

export type LinkState = GitHubLink['state'];

/** One line of the members' links table: a member and what is known of their link. */
export interface MemberLinkRow {
  readonly member: OrgMember;
  readonly state: LinkState;
  readonly login: string | undefined;
  readonly linkedAt: string | undefined;
}

/** Every member with their link, in the order read (a next page comes under the rows shown); no link is `not_linked`. */
export function linkRows(members: readonly OrgMember[], links: readonly GitHubLink[]): MemberLinkRow[] {
  const byMember = new Map(links.map((link) => [link.memberId, link]));
  return members.map((member) => {
    const link = byMember.get(member.id);
    return {
      member,
      state: link?.state ?? 'not_linked',
      login: link?.login,
      linkedAt: link?.linkedAt,
    } satisfies MemberLinkRow;
  });
}
