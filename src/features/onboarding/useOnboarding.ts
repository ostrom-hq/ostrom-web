// SPDX-License-Identifier: AGPL-3.0-only
import {
  createOrgMutation,
  getMeOptions,
  getGithubAppOptions,
  listInvitationsOptions,
  listMyOrganizationsQueryKey,
  listOrgMembersOptions,
  listOrgsOptions,
  listOrgsQueryKey,
  listSharedAccountsOptions,
  listWorkflowsOptions,
} from '@gen/api/@tanstack/react-query.gen';
import type { OrgView } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { apiUrl } from '@/shared/api/apiClient';
import { failureOf } from '@/shared/api/failureOf';
import { meOf } from '@/shared/auth/me';
import { ready } from '@/shared/api/ready';
import { safeLocalStorage } from '@/shared/lib/safeStorage';
import { useOrgStore } from '@/shared/org/orgStore';
import { githubInstallUrl } from '@/shared/org/githubInstall';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { originOf, type SetupStep, setupSteps } from './model';

export interface HomeViewModel {
  /** Nobody is signed in: the server refused the person's list of organizations. */
  readonly signedOut: boolean;
  readonly failure: Error | undefined;
}

/** Whether someone is signed in, read from their own list of organizations (no `/me` needed). */
export function useHome(): HomeViewModel {
  const list = useQuery(ready(listOrgsOptions(), { staleTime: 60_000 }));
  const failure = failureOf(list.error);
  const signedOut = isApiFailure(failure) && failure.kind === 'unauthorized';
  return { signedOut, failure: signedOut ? undefined : failure };
}

export interface CreateOrgViewModel {
  readonly create: (name: string, slug: string | undefined) => void;
  readonly creating: boolean;
  /** The short name asked for is someone else's. */
  readonly slugTaken: boolean;
  readonly failure: Error | undefined;
  /** Forgets the last refusal, once what was refused is changed. */
  readonly edited: () => void;
}

/** Creates the organization, acts in it at once, and reads every list of organizations again. */
export function useCreateOrg(): CreateOrgViewModel {
  const queryClient = useQueryClient();
  const choose = useOrgStore((state) => state.choose);
  const only = useOrgStore((state) => state.only);
  const me = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  const login = meOf(me.data)?.dev.login;
  const mutation = useMutation({
    ...createOrgMutation(),
    onSuccess: async (org: OrgView) => {
      // The lists are read again first: chosen while the picker's list lacks it, the new organization would be taken
      // for one the person left, and dropped.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listOrgsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: listMyOrganizationsQueryKey() }),
      ]);
      // Kept with the login, as a choice in the picker: a person who had other organizations acts in the new one, and
      // what was read in the others is read again.
      if (login === undefined) only(org.id);
      else choose(org.id, login);
    },
  });
  const { mutate, reset } = mutation;
  const create = useCallback(
    (name: string, slug: string | undefined) => {
      mutate({ body: slug === undefined ? { name: name.trim() } : { name: name.trim(), slug } });
    },
    [mutate],
  );
  const failure = failureOf(mutation.error);
  const slugTaken = isApiFailure(failure) && failure.kind === 'conflict';
  return {
    create,
    creating: mutation.isPending || mutation.isSuccess,
    slugTaken,
    failure: slugTaken ? undefined : failure,
    edited: reset,
  };
}

/** Where the guide is put away, per organization: a preference of this browser, not a secret. */
export const GUIDE_HIDDEN_KEY = 'ostrom.setup.hidden';
/** Where the person said the CLI is set up, per organization. */
export const GUIDE_CLI_KEY = 'ostrom.setup.cli';

export interface SetupViewModel {
  readonly steps: readonly SetupStep[];
  readonly done: number;
  /** The address `ostrom login --server` takes. */
  readonly server: string;
  /** Where the GitHub App is installed, for an owner or an admin; nobody else may install it nor invite. */
  readonly install: string | undefined;
  readonly hidden: boolean;
  readonly hide: () => void;
  readonly show: () => void;
  /** Says the CLI is set up. */
  readonly cliDone: () => void;
}

/**
 * What is set up in the organization, read from the routes that would tell. A route the server does not serve yet
 * (the GitHub App, workflows) leaves its step unknown, never done, and shows no error: the guide still leads there.
 */
export function useSetup(org: string, role: OrgRole | undefined): SetupViewModel {
  const quiet = { retry: false, staleTime: 30_000 } as const;
  const github = useQuery(ready(getGithubAppOptions(), quiet));
  const members = useQuery(ready(listOrgMembersOptions({ path: { org } }), quiet));
  const invitations = useQuery(
    ready(listInvitationsOptions({ path: { org } }), { ...quiet, enabled: managesMembers(role) }),
  );
  const accounts = useQuery(ready(listSharedAccountsOptions(), quiet));
  const workflows = useQuery(ready(listWorkflowsOptions(), quiet));
  const cliKey = `${GUIDE_CLI_KEY}.${org}`;
  const [cli, setCli] = useState(() => safeLocalStorage.getItem(cliKey) === '1');
  const steps = useMemo(
    () =>
      setupSteps({
        githubInstalled: github.data?.installed,
        people: members.data?.items.length,
        invitations: invitations.data?.items.length,
        accounts: accounts.data?.items.length,
        workflows: workflows.data?.items.length,
        cliDone: cli,
      }),
    [github.data, members.data, invitations.data, accounts.data, workflows.data, cli],
  );
  const key = `${GUIDE_HIDDEN_KEY}.${org}`;
  const [hidden, setHidden] = useState(() => safeLocalStorage.getItem(key) === '1');
  return {
    steps,
    done: steps.filter((step) => step.state === 'done').length,
    server: originOf(apiUrl('/api/v1/'), window.location.href),
    install: managesMembers(role) ? githubInstallUrl(org) : undefined,
    hidden,
    hide: () => {
      safeLocalStorage.setItem(key, '1');
      setHidden(true);
    },
    show: () => {
      safeLocalStorage.removeItem(key);
      setHidden(false);
    },
    cliDone: () => {
      safeLocalStorage.setItem(cliKey, '1');
      setCli(true);
    },
  };
}
