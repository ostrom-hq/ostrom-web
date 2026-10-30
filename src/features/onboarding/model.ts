// SPDX-License-Identifier: AGPL-3.0-only

/** The steps of setting up an organization, in the order a team takes them. */
export const SETUP_STEPS = ['org', 'github', 'team', 'accounts', 'rules', 'cli'] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** Done, still to do, or not known (the server does not serve what would tell): never counted as done. */
export type StepState = 'done' | 'todo' | 'unknown';

export interface SetupFacts {
  /** The GitHub App is installed on the organization; undefined when the server cannot say. */
  readonly githubInstalled: boolean | undefined;
  /** People in the organization, and invitations waiting. */
  readonly people: number | undefined;
  readonly invitations: number | undefined;
  readonly accounts: number | undefined;
  readonly workflows: number | undefined;
  /** The person said the CLI is set up: nothing the console reads can tell. */
  readonly cliDone: boolean;
}

export interface SetupStep {
  readonly id: SetupStepId;
  readonly state: StepState;
}

function known(count: number | undefined): StepState {
  if (count === undefined) return 'unknown';
  return count > 0 ? 'done' : 'todo';
}

/** Each step and whether it is done, from what the server answered. */
export function setupSteps(facts: SetupFacts): readonly SetupStep[] {
  const team = facts.people === undefined ? 'unknown' : known(facts.people - 1 + (facts.invitations ?? 0));
  const states: Readonly<Record<SetupStepId, StepState>> = {
    org: 'done',
    github: facts.githubInstalled === undefined ? 'unknown' : facts.githubInstalled ? 'done' : 'todo',
    team,
    accounts: known(facts.accounts),
    rules: known(facts.workflows),
    // Nothing the console reads says the CLI is installed: the person says so.
    cli: facts.cliDone ? 'done' : 'todo',
  };
  return SETUP_STEPS.map((id) => ({ id, state: states[id] }));
}

/** The first step not done: the one the guide opens. */
export function currentStep(steps: readonly SetupStep[]): SetupStepId | undefined {
  return steps.find((step) => step.state !== 'done')?.id;
}

/** The address the CLI signs in to: the origin of the API, read from an address on it. */
export function originOf(apiAddress: string, page: string): string {
  return new URL(apiAddress, page).origin;
}
