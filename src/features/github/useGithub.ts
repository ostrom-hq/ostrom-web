// SPDX-License-Identifier: AGPL-3.0-only
import {
  getAnalysisStateOptions,
  getAnalysisStateQueryKey,
  getGithubAppOptions,
  listReposOptions,
  restartAnalysisMutation,
  startAnalysisMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { AnalysisState, Repo } from '@gen/api/types.gen';
import { zAnalysisState } from '@gen/api/zod.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import {
  type AnalysisRunStage,
  type AnalysisStage,
  type InstallOutcome,
  installUrl,
  reposShown,
  safeAppPage,
  stageOf,
} from './model';

/** A running analysis is read again this often. */
export const ANALYSIS_POLL_MS = 2_000;
/** After a failing read, the next one waits this long. */
export const ANALYSIS_RETRY_MS = 15_000;

export interface GithubApp {
  readonly installed: boolean;
  readonly slug: string | undefined;
  /** The App's page on GitHub. */
  readonly page: string | undefined;
}

export interface Analysis {
  readonly state: AnalysisState;
  readonly stage: AnalysisStage;
  /** Starts a run, or restarts a failed one; none while one runs, nor for anyone but an owner or an admin. */
  readonly run: { readonly from: AnalysisRunStage; readonly go: () => void } | undefined;
  readonly starting: boolean;
  readonly failure: Error | undefined;
}

export interface GithubViewModel {
  readonly app: GithubApp | undefined;
  readonly appFailure: Error | undefined;
  /** Where an owner or an admin installs the App, or changes its repositories on GitHub; nobody else may. */
  readonly install: string | undefined;
  /** The repositories the App was given: the ones Ostrom governs. Never read before the App is installed. */
  readonly repos: readonly Repo[] | undefined;
  /** The server holds more repositories than one page shows. */
  readonly more: boolean;
  readonly reposFailure: Error | undefined;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly shown: readonly Repo[];
  /** The analysis of the rules; undefined until read. */
  readonly analysis: Analysis | undefined;
  readonly analysisFailure: Error | undefined;
  /** False when the server does not serve the analysis yet (404, 501): nothing to show, and nothing went wrong. */
  readonly analysisServed: boolean;
}

/** The organization's GitHub App, the repositories it governs, and the analysis that proposes their rules. */
export function useGithub(org: string, role: OrgRole | undefined): GithubViewModel {
  const queryClient = useQueryClient();
  const app = useQuery(ready(getGithubAppOptions(), { staleTime: 30_000 }));
  const installed = app.data?.installed === true;
  const repos = useQuery(ready(listReposOptions(), { staleTime: 30_000, enabled: installed }));
  const state = useQuery(
    ready(getAnalysisStateOptions(), {
      enabled: installed,
      retry: false,
      // Only while a run goes on. A failing read is said on the page and slows the poll down, never stops it: a
      // passing blip must not freeze a run the server finishes.
      refetchInterval: (query) => {
        const read = zAnalysisState.safeParse(query.state.data);
        if (!read.success || stageOf(read.data) !== 'running') return false;
        return query.state.error === null ? ANALYSIS_POLL_MS : ANALYSIS_RETRY_MS;
      },
    }),
  );
  // Read the state again after any answer: a refusal (a run another admin started, one that ended in another tab)
  // means the page is behind.
  const onSettled = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: getAnalysisStateQueryKey() });
  };
  const start = useMutation({ ...startAnalysisMutation(), onSettled });
  const restart = useMutation({ ...restartAnalysisMutation(), onSettled });
  // A refusal speaks only while the page still shows the stage it was tried from: once the state read again tells
  // otherwise (another admin's run, a run that ended elsewhere), the page says it, and the refusal is forgotten.
  const stage = state.data === undefined ? undefined : stageOf(state.data);
  const { reset: resetStart } = start;
  const { reset: resetRestart } = restart;
  useEffect(() => {
    resetStart();
    resetRestart();
  }, [stage, resetStart, resetRestart]);
  const [query, setQuery] = useState('');
  const items = repos.data?.items;
  const shown = useMemo(() => reposShown(items ?? [], query), [items, query]);
  const manager = managesMembers(role);
  let analysis: Analysis | undefined;
  if (state.data !== undefined && stage !== undefined) {
    analysis = {
      state: state.data,
      stage,
      run:
        manager && stage !== 'running'
          ? {
              from: stage,
              go: () => {
                // Only the last attempt speaks: an older refusal of the other call never stays on screen.
                const [used, other] = stage === 'failed' ? [restart, start] : [start, restart];
                other.reset();
                used.mutate({});
              },
            }
          : undefined,
      starting: start.isPending || restart.isPending,
      failure: failureOf(start.error ?? restart.error),
    };
  }
  return {
    app:
      app.data === undefined
        ? undefined
        : { installed: app.data.installed, slug: app.data.slug, page: safeAppPage(app.data.htmlUrl) },
    appFailure: failureOf(app.error),
    install: manager ? installUrl(org) : undefined,
    repos: items,
    more: repos.data?.next !== undefined,
    reposFailure: failureOf(repos.error),
    query,
    setQuery,
    shown,
    analysis,
    analysisFailure: failureOf(state.error),
    analysisServed: !(isApiFailure(state.error) && unserved(state.error.status)),
  };
}

/** A route the server does not serve yet answers 404, or 501 from a server that knows it but has no engine behind. */
function unserved(status: number | undefined): boolean {
  return status === 404 || status === 501;
}

/**
 * What GitHub's install brought back (`?installed=1`, `?error=<type>`), read once: the address is cleaned at once, so
 * a reload or a shared link says nothing again.
 */
export function useInstallOutcome(): InstallOutcome {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const [outcome] = useState<InstallOutcome>(() => ({
    installed: search.installed === true,
    error: search.error,
  }));
  const back = search.installed !== undefined || search.error !== undefined;
  useEffect(() => {
    if (back) void navigate({ to: '/github', search: {}, replace: true });
  }, [back, navigate]);
  return outcome;
}
