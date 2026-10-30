import { setupServer, type SetupServer } from 'msw/node';
import { createHandlers, createMockDb, type MockDb } from '@/mocks/handlers';

export interface MockServer {
  readonly server: SetupServer;
  readonly db: MockDb;
}

/** The same handlers as the browser, for Vitest: one fresh in-memory database per call. */
export function createMockServer(): MockServer {
  const db = createMockDb();
  return { server: setupServer(...createHandlers(db)), db };
}
