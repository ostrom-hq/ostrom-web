// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { setupMockApp } from '@/test/mockApp';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { useOrgStore } from '@/shared/org/orgStore';

const { db } = setupMockApp();

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the organization a screen acts in', () => {
  it('is the only one when none is chosen yet', async () => {
    // Before the picker takes it (the list of the top bar may answer later than the screen's own).
    expect(useOrgStore.getState().current).toBeUndefined();
    const { result } = renderHook(() => useCurrentOrg(), { wrapper });
    await waitFor(() => {
      expect(result.current.org?.id).toBe(db.organization.id);
    });
    expect(useOrgStore.getState().current).toBeUndefined();
  });
});
