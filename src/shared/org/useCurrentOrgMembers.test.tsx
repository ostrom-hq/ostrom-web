// SPDX-License-Identifier: Apache-2.0
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { OrgMember } from '@gen/api/types.gen';
import type { ReactElement, ReactNode } from 'react';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';
import { useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp } from '@/test/mockApp';

const { server, db } = setupMockApp();

/** 150 more members: a second page after the first hundred. */
function moreMembers(): OrgMember[] {
  return Array.from({ length: 150 }, (_, n) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    login: `dev-${String(n)}`,
    name: '',
    avatarUrl: '',
    email: null,
    role: 'member',
    joinedAt: '2026-09-01T09:00:00Z',
  }));
}

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

  it('reads every page by themselves with `all`, and are settled only once the last is in', async () => {
    const large = moreMembers();
    db.orgMembers[db.organization.id] = [...(db.orgMembers[db.organization.id] ?? []), ...large];
    const { result } = renderHook(() => useCurrentOrgMembers({ all: true }), { wrapper });
    await waitFor(() => {
      expect(result.current.members?.length).toBeGreaterThan(100);
    });
    expect(result.current.settled).toBe(result.current.complete);
    await waitFor(
      () => {
        expect(result.current.settled).toBe(true);
      },
      { timeout: 10_000 },
    );
    expect(result.current.complete).toBe(true);
    expect(result.current.members?.length).toBe(db.orgMembers[db.organization.id]?.length);
    expect(result.current.more).toBeUndefined();
  });

  it('keep the pages read when a next one fails: not the list’s failure, and asked again only when asked', async () => {
    db.orgMembers[db.organization.id] = [...(db.orgMembers[db.organization.id] ?? []), ...moreMembers()];
    let asked = 0;
    server.use(
      http.get('*/api/v1/orgs/:org/members', ({ request }) => {
        if (!new URL(request.url).searchParams.has('after')) return undefined;
        asked += 1;
        return HttpResponse.json({ error: { type: 'internal', message: 'page 2 is down' } }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useCurrentOrgMembers({ all: true }), { wrapper });
    await waitFor(() => {
      expect(result.current.moreFailed).toBe(true);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.complete).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.members).toHaveLength(100);
    expect(asked).toBe(1);
    const again = result.current.more;
    expect(again).toBeDefined();
    again?.();
    await waitFor(() => {
      expect(asked).toBe(2);
    });
  });

  it('ask for each page once, however many parts of the screen read every page', async () => {
    db.orgMembers[db.organization.id] = [
      ...(db.orgMembers[db.organization.id] ?? []),
      ...moreMembers(),
      ...moreMembers().map((member) => ({
        ...member,
        id: member.id.replace('00000000-0000', '11111111-1111'),
        login: `${member.login}-b`,
      })),
    ];
    const asked: string[] = [];
    server.use(
      http.get('*/api/v1/orgs/:org/members', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('after') ?? 'first');
        return undefined;
      }),
    );
    const { result } = renderHook(
      () => [useCurrentOrgMembers({ all: true }), useCurrentOrgMembers({ all: true })] as const,
      { wrapper },
    );
    await waitFor(
      () => {
        expect(result.current[0].complete && result.current[1].complete).toBe(true);
      },
      { timeout: 10_000 },
    );
    expect(result.current[0].members?.length).toBe(db.orgMembers[db.organization.id]?.length);
    // 305 members: three pages of a hundred, then the last five, each asked once.
    expect(asked).toHaveLength(4);
    expect(new Set(asked).size).toBe(4);
  });
});
