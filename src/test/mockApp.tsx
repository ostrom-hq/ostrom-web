// SPDX-License-Identifier: AGPL-3.0-only
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { type AppRouter, createAppRouter } from '@/app/router';
import { resetArrivals } from '@/features/yes';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer, type MockServer } from '@/mocks/node';
import { configureApiClient } from '@/shared/api/apiClient';
import { useAuthStore } from '@/shared/auth/authStore';

/** The base URL the tests give the client: links built from the contract start with it. */
export const TEST_API = 'http://ostrom.test';

/** The whole console against the in-memory API, one fresh database per test. */
export function setupMockApp(): MockServer {
  const mock = createMockServer();
  beforeAll(() => {
    mock.server.listen({ onUnhandledFrame: 'error' });
    configureApiClient({ baseUrl: TEST_API });
  });
  afterEach(() => {
    mock.server.resetHandlers();
    resetMockDb(mock.db);
    useAuthStore.setState({ link: undefined, notice: undefined });
    resetArrivals();
  });
  afterAll(() => {
    mock.server.close();
  });
  return mock;
}

export function visit(path: string): AppRouter {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<App router={router} />);
  return router;
}
