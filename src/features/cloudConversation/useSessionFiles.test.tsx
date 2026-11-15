// SPDX-License-Identifier: Apache-2.0
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactElement, ReactNode } from 'react';
import { ready } from '@/shared/api/ready';
import { FetchXhr } from '@/test/fetchXhr';
import { setupMockApp } from '@/test/mockApp';
import { useSessionFiles } from './useSessionFiles';

const { server } = setupMockApp();

/** Signed in, as the top bar makes it: the server's capabilities are read once `/auth/me` is. */
function SignedIn(): null {
  useQuery(ready(getMeOptions()));
  return null;
}

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SignedIn />
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FetchXhr);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])], 'a.png', { type: 'image/png' });

describe('the files of a composer, as a hook (TeamCode SessionFiles)', () => {
  it('does nothing before the policy is read', () => {
    const { result } = renderHook(() => useSessionFiles('cs-33'), { wrapper });
    act(() => {
      result.current.attach([PNG]);
      result.current.explainUnavailable();
      result.current.retry('none');
    });
    expect(result.current.supported).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(result.current.notice).toBeUndefined();
  });

  it('explains nothing while a file can be added, and retries only a file it knows', async () => {
    const { result } = renderHook(() => useSessionFiles('cs-33'), { wrapper });
    await waitFor(() => {
      expect(result.current.canAttach).toBe(true);
    });
    act(() => {
      result.current.explainUnavailable();
      result.current.retry('none');
    });
    expect(result.current.notice).toBeUndefined();
    expect(result.current.files).toEqual([]);
  });

  it('never sends again a file refused for good', async () => {
    let uploads = 0;
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/files', () => {
        uploads += 1;
        return HttpResponse.json(
          { error: { type: 'file_type_not_allowed', message: 'no' } },
          { status: 415 },
        );
      }),
    );
    const { result } = renderHook(() => useSessionFiles('cs-33'), { wrapper });
    await waitFor(() => {
      expect(result.current.canAttach).toBe(true);
    });
    act(() => {
      result.current.attach([PNG]);
    });
    await waitFor(() => {
      expect(result.current.files[0]?.state).toBe('failed');
    });
    act(() => {
      result.current.retry(result.current.files[0]?.localId ?? '');
    });
    expect(result.current.files[0]?.state).toBe('failed');
    expect(uploads).toBe(1);
  });
});
