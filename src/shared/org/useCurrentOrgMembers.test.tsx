// SPDX-License-Identifier: Apache-2.0
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactElement, ReactNode } from 'react';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';
import { useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp } from '@/test/mockApp';

const { server, db } = setupMockApp();

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the members of the organization a screen acts in', () => {
  it('are read from the organization’s own route once it is known', async () => {
    const { result } = renderHook(() => useCurrentOrgMembers(), { wrapper });
    expect(result.current.settled).toBe(false);
    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.members?.map((member) => member.login)).toContain('samir');
  });

  it('are settled, with the reason, when the organizations cannot be read', async () => {
    server.use(
      http.get('*/api/v1/orgs', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'orgs are down' } }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useCurrentOrgMembers(), { wrapper });
    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.members).toBeUndefined();
    expect(result.current.error).toBeDefined();
  });

  it('are settled when the person belongs to no organization yet', async () => {
    db.noOrganization = true;
    const { result } = renderHook(() => useCurrentOrgMembers(), { wrapper });
    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.members).toBeUndefined();
  });

  it('are settled while the picker waits for a choice between organizations', async () => {
    db.otherOrganizations = [
      { ...db.organization, id: '8c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'Globex' },
    ];
    expect(useOrgStore.getState().current).toBeUndefined();
    const { result } = renderHook(() => useCurrentOrgMembers(), { wrapper });
    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });
    expect(result.current.members).toBeUndefined();
  });
});
