import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppRouter } from '@/app/router';

export interface AppProps {
  readonly router: AppRouter;
  /** The API is served by MSW: say so on every screen, so demo data is never taken for real approvals. */
  readonly mocks?: boolean;
}

export function App({ router, mocks = false }: AppProps): ReactElement {
  const { t } = useTranslation();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }),
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
