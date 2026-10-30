import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppRouter } from '@/app/router';
import { retryOnce } from '@/shared/api/retry';
import { useAuthStore } from '@/shared/auth/authStore';
import { useOrgStore } from '@/shared/org/orgStore';

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
  // Everything cached was read as the previous account: a switch of account starts from nothing.
  useEffect(
    () =>
      useAuthStore.subscribe((auth, previous) => {
        if (auth.token !== previous.token) queryClient.clear();
      }),
    [queryClient],
  );
  // Read in another organization, or refused for want of one: everything is read again in the one chosen.
  useEffect(
    () =>
      useOrgStore.subscribe((org, previous) => {
        if (org.generation !== previous.generation) void queryClient.resetQueries();
      }),
    [queryClient],
  );
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
