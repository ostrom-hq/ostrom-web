// SPDX-License-Identifier: AGPL-3.0-only
import type { Repo } from '@gen/api/types.gen';
import { z } from 'zod';
import { apiUrl } from '@/shared/api/apiClient';
import { safeHref } from '@/shared/lib/safeHref';

/**
 * What GitHub's install brings back, through the server's callback: `/github?installed=1`, or
 * `/github?error=<type>`. The address never carries free text: an error is a type, put in words by the console.
 */
export const githubSearchSchema = z.object({
  installed: z
    .unknown()
    // `1` as the server sends it; `true` once read, as the router validates its own output again.
    .transform((value) => value === 1 || value === '1' || value === true)
    .optional(),
  // A type the console words, or `unknown`: never the text of the address.
  error: z.enum(['denied', 'expired', 'forbidden', 'unknown']).optional().catch('unknown'),
});
export type GithubSearch = z.infer<typeof githubSearchSchema>;

/** What the install brought back, kept for the page's life once the address is cleaned. */
export interface InstallOutcome {
  readonly installed: boolean;
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
