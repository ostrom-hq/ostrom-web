import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import type { AppRouter } from '@/app/router';

export interface AppProps {
  readonly router: AppRouter;
}

export function App({ router }: AppProps): ReactElement {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
