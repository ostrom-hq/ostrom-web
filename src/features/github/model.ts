// SPDX-License-Identifier: AGPL-3.0-only
import type { Repo } from '@gen/api/types.gen';
import { z } from 'zod';
import { apiUrl } from '@/shared/api/apiClient';

/**
 * What GitHub's install brings back, through the server's callback: `/github?installed=1`, or
 * `/github?error=<type>`. The address never carries free text: an error is a type, put in words by the console.
 */
export const githubSearchSchema = z.object({
  installed: z
    .unknown()
    .transform(() => true as const)
    .optional(),
  error: z
    .unknown()
    .transform((value) => (typeof value === 'string' && /^[a-z0-9_]{1,40}$/.test(value) ? value : 'unknown'))
    .optional(),
});
export type GithubSearch = z.infer<typeof githubSearchSchema>;

/** What the install brought back, kept for the page's life once the address is cleaned. */
export interface InstallOutcome {
  readonly installed: boolean;
  readonly error: string | undefined;
}

/** The error types of the install the console puts in its own words; any other reads as `unknown`. */
export const INSTALL_ERRORS = ['denied', 'expired', 'forbidden', 'unknown'] as const;
export type InstallError = (typeof INSTALL_ERRORS)[number];

export function installErrorOf(type: string): InstallError {
  return INSTALL_ERRORS.find((known) => known === type) ?? 'unknown';
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
      const pushed = (b.pushedAt ?? '').localeCompare(a.pushedAt ?? '');
      return pushed === 0 ? a.name.localeCompare(b.name) : pushed;
    });
}

/**
 * Where the analysis is. `never`: the organization was never analysed. `running`: a run goes on (`connect`, then the
 * engine's phases). `ready` and `failed`: the last run is over.
 */
export type AnalysisStage = 'never' | 'running' | 'ready' | 'failed';

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
