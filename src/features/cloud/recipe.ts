// SPDX-License-Identifier: Apache-2.0
import type { CloudEnvironment, CloudRepository, CloudSession } from '@gen/api/types.gen';
import { zRunnerPreparationReport } from '@gen/api/zod.gen';
import { isKnown, knownValues } from '@/shared/lib/openEnum';

/**
 * The preparation recipe of a cloud session (`runners.cloud.environment.v1`), as the person types it. The server checks
 * it again and is the judge (ostrom-server `CloudEnvironmentRules`); the console says the same rules first, so a recipe
 * it sends is one the server takes.
 */
export interface RepositoryDraft {
  readonly url: string;
  readonly path: string;
  readonly ref: string;
  readonly branch: string;
}

export interface RecipeDraft {
  readonly repositories: readonly RepositoryDraft[];
  readonly workingDirectory: string;
  /** One command a line, run once per workspace. */
  readonly create: string;
  /** One command a line, run on every execution. */
  readonly start: string;
  /** Variable names, separated by spaces, commas or lines. */
  readonly requiredVariables: string;
  readonly requireGitHub: boolean;
  readonly gitEmailDomain: string;
}

export const EMPTY_REPOSITORY: RepositoryDraft = { url: '', path: '', ref: '', branch: '' };

export const EMPTY_RECIPE: RecipeDraft = {
  repositories: [],
  workingDirectory: '',
  create: '',
  start: '',
  requiredVariables: '',
  requireGitHub: false,
  gitEmailDomain: '',
};

/** The server's bounds (`CloudEnvironmentRules`). */
export const MAX_REPOSITORIES = 16;
const MAX_COMMANDS = 16;
const MAX_COMMAND_LENGTH = 4096;
const MAX_REQUIRED_VARIABLES = 64;
const MAX_PATH_LENGTH = 255;
const MAX_SEGMENTS = 8;

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
const GITHUB_URL = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;
const VARIABLE = /^[A-Z_][A-Z0-9_]{0,127}$/;
const DOMAIN = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;

/** What is wrong with a recipe, as a key of `cloud.recipe.problem`. */
export type RecipeProblem =
  'both' | 'repositories' | 'url' | 'path' | 'ref' | 'nested' | 'commands' | 'variables' | 'domain';

export type RecipeCheck =
  { readonly problem: RecipeProblem } | { readonly environment: CloudEnvironment | undefined };

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function names(text: string): string[] {
  return text.split(/[\s,]+/).filter((name) => name !== '');
}

/** A path below `/workspace`, outside the runner's own directories: no segment starts with a dot. */
function validPath(path: string): boolean {
  const parts = path.replace(/\/+$/, '').split('/');
  return (
    path.length <= MAX_PATH_LENGTH &&
    !path.startsWith('/') &&
    parts.length <= MAX_SEGMENTS &&
    parts.every((part) => SEGMENT.test(part))
  );
}

/** A branch, tag or commit `git` takes, never one that looks like an option. */
function validRef(ref: string): boolean {
  return (
    REF.test(ref) &&
    !ref.startsWith('-') &&
    !ref.startsWith('/') &&
    !ref.endsWith('/') &&
    !ref.endsWith('.lock') &&
    !ref.includes('..') &&
    !ref.includes('//')
  );
}

/** The directory the server clones into when none is named: the repository's name. */
function defaultPath(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1).replace(/\.git$/, '');
}

function repositoryOf(draft: RepositoryDraft): CloudRepository {
  const path = draft.path.trim();
  const ref = draft.ref.trim();
  const branch = draft.branch.trim();
  return {
    url: draft.url.trim(),
    ...(path === '' ? {} : { path }),
    ...(ref === '' ? {} : { ref }),
    ...(branch === '' ? {} : { branch }),
  };
}

function repositoryProblem(repository: CloudRepository): RecipeProblem | undefined {
  if (!GITHUB_URL.test(repository.url.replace(/\.git$/, ''))) return 'url';
  if (repository.path !== undefined && !validPath(repository.path)) return 'path';
  if ([repository.ref, repository.branch].some((ref) => ref !== undefined && !validRef(ref))) return 'ref';
  return undefined;
}

/** Each repository in its own directory, never inside another one's. */
function nested(repositories: readonly CloudRepository[]): boolean {
  const paths = repositories.map((repository) =>
    (repository.path ?? defaultPath(repository.url)).replace(/\/+$/, ''),
  );
  return paths.some(
    (path) => paths.filter((other) => other === path || other.startsWith(`${path}/`)).length > 1,
  );
}

/**
 * The recipe to send, or why it would be refused. `repo` is the single repository of the form's older field: the server
 * takes it or the recipe's repositories, never both. A recipe that asks for nothing is not sent.
 */
export function checkRecipe(draft: RecipeDraft, repo: string): RecipeCheck {
  const repositories = draft.repositories
    .filter((row) => [row.url, row.path, row.ref, row.branch].some((value) => value.trim() !== ''))
    .map(repositoryOf);
  if (repositories.length > 0 && repo.trim() !== '') return { problem: 'both' };
  if (repositories.length > MAX_REPOSITORIES) return { problem: 'repositories' };
  const wrong = repositories.map(repositoryProblem).find((problem) => problem !== undefined);
  if (wrong !== undefined) return { problem: wrong };
  if (nested(repositories)) return { problem: 'nested' };
  const workingDirectory = draft.workingDirectory.trim();
  if (workingDirectory !== '' && !validPath(workingDirectory)) return { problem: 'path' };
  const create = lines(draft.create);
  const start = lines(draft.start);
  if (
    [create, start].some(
      (commands) =>
        commands.length > MAX_COMMANDS ||
        commands.some((command) => command.length > MAX_COMMAND_LENGTH || command.includes('\u0000')),
    )
  )
    return { problem: 'commands' };
  const required = names(draft.requiredVariables);
  if (
    required.length > MAX_REQUIRED_VARIABLES ||
    new Set(required).size !== required.length ||
    !required.every((name) => VARIABLE.test(name))
  )
    return { problem: 'variables' };
  const gitEmailDomain = draft.gitEmailDomain.trim();
  if (gitEmailDomain !== '' && !DOMAIN.test(gitEmailDomain)) return { problem: 'domain' };
  const environment: CloudEnvironment = {
    ...(repositories.length === 0 ? {} : { repositories }),
    ...(workingDirectory === '' ? {} : { workingDirectory }),
    ...(create.length === 0 && start.length === 0
      ? {}
      : {
          setup: { ...(create.length === 0 ? {} : { create }), ...(start.length === 0 ? {} : { start }) },
        }),
    ...(required.length === 0 ? {} : { requiredVariables: required }),
    ...(draft.requireGitHub ? { requireGitHub: true } : {}),
    ...(gitEmailDomain === '' ? {} : { gitEmailDomain }),
  };
  return { environment: Object.keys(environment).length === 0 ? undefined : environment };
}

/** The preparation phases the runner reports, read from the contract; another phase is not shown. */
export const PREPARATION_PHASES = knownValues(zRunnerPreparationReport.shape.phase);
export type PreparationPhase = (typeof PREPARATION_PHASES)[number];

/** The preparation step a session is in, when it is one the console has words for. */
export function preparationOf(session: CloudSession): PreparationPhase | undefined {
  const phase = session.phase;
  return phase !== undefined && isKnown(PREPARATION_PHASES, phase) ? phase : undefined;
}

/**
 * What to do about a failed preparation: try again when the server says it may pass (a clone or a fetch), otherwise
 * fix what the session asks for, as trying the same again fails the same way.
 */
export function preparationAdvice(session: CloudSession): 'retry' | 'fix' | undefined {
  const failure = session.failure;
  if (failure?.code !== 'preparation_failed') return undefined;
  return failure.retryable === true ? 'retry' : 'fix';
}
