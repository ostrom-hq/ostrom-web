// SPDX-License-Identifier: AGPL-3.0-only
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { type AppRouter, createAppRouter } from '@/app/router';
import { resetArrivals } from '@/features/yes';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer, type MockServer } from '@/mocks/node';
import { configureApiClient } from '@/shared/api/apiClient';
import { createHandlerFetch, type MockTraffic } from '@/test/handlerFetch';
import { useAuthStore } from '@/shared/auth/authStore';
import { useOrgStore } from '@/shared/org/orgStore';

/** The base URL the tests give the client: links built from the contract start with it. */
export const TEST_API = 'http://ostrom.test';

/** The whole console against the in-memory API, one fresh database per test. */
export function setupMockApp(): MockServer & { readonly traffic: MockTraffic } {
  const mock = createMockServer();
  const { fetch: answer, traffic, abortInFlight } = createHandlerFetch(mock.server);
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    // Still listening: anything that does not go through fetch is caught by MSW rather than sent out.
    mock.server.listen({ onUnhandledFrame: 'error' });
    // Calls are answered by the handlers themselves, not through a socket (see createHandlerFetch).
    globalThis.fetch = answer;
    configureApiClient({ baseUrl: TEST_API });
  });
  afterEach(() => {
    // Unmount first: a console still mounted would act on the resets below (take the only organization again).
    cleanup();
    // Then call off what is still in flight: a mutation's own callbacks outlive the screen, and a late answer would
    // act during the next test (leave for GitHub through the next test's `exit.assign` spy).
    abortInFlight();
    mock.server.resetHandlers();
    traffic.clear();
    resetMockDb(mock.db);
    useAuthStore.setState({ link: undefined, notice: undefined });
    useOrgStore.getState().forget();
    resetArrivals();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    mock.server.close();
  });
  return { ...mock, traffic };
}

export function visit(path: string): AppRouter {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<App router={router} />);
  return router;
}
