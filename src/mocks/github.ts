// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleGetAnalysisState,
  handleGetGithubApp,
  handleListRepos,
  handleRestartAnalysis,
  handleStartAnalysis,
} from '@gen/api/msw.gen';
import type { ApiError, Organization, Repo, Rule, Workflow } from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** An analysis as the mock runs it: one phase further at each read of its state, as if the engine worked. */
export interface MockAnalysis {
  phase: string;
  progress: number;
  /** Stops at `failed` instead of `ready`. */
  fails: boolean;
}

export interface GithubState extends OrgsState {
  /** The repositories each organization gave the App, by organization id. */
  repos: Record<string, Repo[]>;
  /** The last analysis of each organization, by id. */
  analyses: Record<string, MockAnalysis>;
  rules: Rule[];
  workflows: Workflow[];
}

/** The phases a run passes, with how far along each is. */
export const ANALYSIS_PHASES: readonly (readonly [string, number])[] = [
  ['connect', 0.05],
  ['read', 0.4],
  ['propose', 0.8],
];

function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

export function createGithubHandlers(
  state: () => GithubState,
  organizationOf: (request: Request) => Organization,
): HttpHandler[] {
  const manages = (organization: Organization): boolean =>
    managesMembers(
      orgRoleOf(state().orgMembers[organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role),
    );
  const start = (
    request: Request,
    again: boolean,
  ): HttpResponse<ApiError> | HttpResponse<{ runId: string }> => {
    const organization = organizationOf(request);
    const s = state();
    if (s.githubInstalled[organization.id] !== true)
      return refusal(409, 'github_not_installed', 'Install the GitHub App first.');
    if (!manages(organization))
      return refusal(403, 'forbidden', 'Only an owner or an admin analyses the repositories.');
    const last = s.analyses[organization.id];
    const failed = last?.phase === 'failed';
    if (last !== undefined && last.phase !== 'ready' && !failed)
      return refusal(409, 'analysis_running', 'An analysis is running.');
    if (again && !failed) return refusal(409, 'analysis_not_failed', 'No failed analysis to restart.');
    s.analyses[organization.id] = { phase: 'connect', progress: 0.05, fails: !again && failed };
    return HttpResponse.json<{ runId: string }>({ runId: `run-${organization.id}` }, { status: 202 });
  };
  return [
    handleGetGithubApp(({ request }) => {
      const organization = organizationOf(request);
      return HttpResponse.json(
        state().githubInstalled[organization.id] === true
          ? {
              installed: true,
              slug: 'ostrom-dev',
              installationId: 4242,
              htmlUrl: 'https://github.com/apps/ostrom-dev',
            }
          : { installed: false, slug: 'ostrom-dev', htmlUrl: 'https://github.com/apps/ostrom-dev' },
      );
    }),
    handleListRepos(({ request }) => {
      const organization = organizationOf(request);
      return HttpResponse.json({ items: state().repos[organization.id] ?? [] });
    }),
    handleGetAnalysisState(({ request }) => {
      const organization = organizationOf(request);
      const s = state();
      const run = s.analyses[organization.id];
      const repos = s.repos[organization.id] ?? [];
      if (run === undefined) return HttpResponse.json({ repos: [], rules: [], workflows: [] });
      const answer = { phase: run.phase, progress: run.progress, repos, rules: [], workflows: [] };
      if (run.phase === 'ready')
        return HttpResponse.json({ ...answer, rules: s.rules, workflows: s.workflows });
      if (run.phase === 'failed')
        return HttpResponse.json({
          ...answer,
          failure: {
            stage: 'read',
            reason: 'GitHub refused to list the code owners.',
            retryPath: '/api/v1/analysis/restart',
          },
        });
      // One phase further at each read: the next one, or the end.
      const index = ANALYSIS_PHASES.findIndex(([phase]) => phase === run.phase);
      const next = ANALYSIS_PHASES[index + 1];
      if (next === undefined) {
        run.phase = run.fails ? 'failed' : 'ready';
        run.progress = 1;
      } else [run.phase, run.progress] = next;
      return HttpResponse.json(answer);
    }),
    handleStartAnalysis(({ request }) => start(request, false)),
    handleRestartAnalysis(({ request }) => start(request, true)),
  ];
}
