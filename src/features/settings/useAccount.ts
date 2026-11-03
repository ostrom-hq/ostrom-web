// SPDX-License-Identifier: AGPL-3.0-only
import { getMyAccountOptions, linkSignInProviderMutation } from '@gen/api/@tanstack/react-query.gen';
import type { Account, LinkStarted } from '@gen/api/types.gen';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { exit } from '@/shared/lib/leave';
import { GITHUB, providerPage } from './model';

export interface GithubLinkViewModel {
  /** Who is signed in and how they sign in; undefined while it loads. */
  readonly account: Account | undefined;
  readonly failure: Error | undefined;
  /** The account signs in with GitHub: its pull requests are known to be theirs. */
  readonly linked: boolean;
  /** Starts linking GitHub: the browser leaves for GitHub's consent page and comes back here. */
  readonly link: () => void;
  /** The server is asked, or the browser is leaving for GitHub: no second click. */
  readonly linking: boolean;
  readonly linkFailure: Error | undefined;
  /** The server named a page that is neither https nor on this machine: the console stayed. */
  readonly unsafePage: boolean;
}

/** The person's account, and the way to link their GitHub to it (Q-GATES-G1). */
export function useGithubLink(): GithubLinkViewModel {
  const query = useQuery(ready(getMyAccountOptions(), { retry: false }));
  const [unsafePage, setUnsafePage] = useState(false);
  const leave = useCallback((started: LinkStarted) => {
    const safe = providerPage(started.authorizationUrl);
    setUnsafePage(!safe);
    if (safe) exit.assign(started.authorizationUrl);
  }, []);
  const linking = useMutation({ ...linkSignInProviderMutation(), onSuccess: leave });
  const { mutate, reset } = linking;
  // Back from GitHub with the browser's back button, the page may come out of its cache as it was left: busy.
  useEffect(() => {
    window.addEventListener('pageshow', reset);
    return () => {
      window.removeEventListener('pageshow', reset);
    };
  }, [reset]);
  const link = useCallback(() => {
    setUnsafePage(false);
    mutate({ path: { provider: GITHUB }, query: { redirect: '/account' } });
  }, [mutate]);
  return {
    account: query.data,
    failure: failureOf(query.error),
    linked: query.data?.providers.includes(GITHUB) ?? false,
    link,
    linking: linking.isPending || (linking.isSuccess && !unsafePage),
    linkFailure: failureOf(linking.error),
    unsafePage,
  };
}
