import { getMeQueryKey, listMyOrganizationsQueryKey } from '@gen/api/@tanstack/react-query.gen';
import { hashKey, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppRouter } from '@/app/router';
import { retryOnce } from '@/shared/api/retry';
import { resetArrivals } from '@/features/yes';
import { useAuthStore } from '@/shared/auth/authStore';
import { followOtherTab, useOrgStore } from '@/shared/org/orgStore';

export interface AppProps {
  readonly router: AppRouter;
  /** The API is served by MSW: say so on every screen, so demo data is never taken for real approvals. */
  readonly mocks?: boolean;
}

export function App({ router, mocks = false }: AppProps): ReactElement {
  const { t } = useTranslation();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: retryOnce } } }),
  );
  // Everything cached was read as the previous account: a sign-in or sign-out starts from nothing.
  useEffect(
    () =>
      useAuthStore.subscribe((auth, previous) => {
        // Reset, not clear: the screens on display read again at once, as the new account or as nobody.
        if (auth.generation === previous.generation) return;
        useOrgStore.getState().signedInOrOut();
        void queryClient.resetQueries();
      }),
    [queryClient],
  );
  // Read in another organization, or refused for want of one: everything is read again in the one chosen. Who is
  // signed in and their organizations do not depend on it, and the organization switch needs them to stay on screen.
  useEffect(
    () =>
      useOrgStore.subscribe((org, previous) => {
        // A call in the organization named found nothing: the person's list is read again, if it is on screen; a
        // refetch already under way is joined. The contract answers 404 alike for "not a member" and "no such
        // thing" (it never says whether an organization exists), so every such 404 costs one list request: no
        // screen polls a single item, so that stays a few requests.
        if (org.doubts !== previous.doubts) {
          void queryClient.refetchQueries(
            { queryKey: listMyOrganizationsQueryKey(), type: 'active' },
            { cancelRefetch: false },
          );
        }
        if (org.generation === previous.generation) return;
        // Another organization has another queue: nothing in it is new because of what the other one showed.
        resetArrivals();
        const kept = new Set([hashKey(getMeQueryKey()), hashKey(listMyOrganizationsQueryKey())]);
        void queryClient.resetQueries({ predicate: (query) => !kept.has(query.queryHash) });
      }),
    [queryClient],
  );
  // A choice made in another tab of the same browser is followed here.
  useEffect(() => {
    window.addEventListener('storage', followOtherTab);
    return () => {
      window.removeEventListener('storage', followOtherTab);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      {mocks ? (
        <p className="o-mock-banner" role="note">
          {t('app.mocks')}
        </p>
      ) : null}
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
