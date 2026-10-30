import { setupWorker } from 'msw/browser';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { createHandlers, createMockDb } from '@/mocks/handlers';

/* v8 ignore start -- a Service Worker only runs in a real browser: the Playwright build with VITE_MOCKS covers it. */
/** Set to `two` before the demo loads (the Playwright journey does): the person belongs to two organizations. */
const MOCK_MEMBERSHIPS_KEY = 'ostrom.mock.memberships';

export async function startMocks(): Promise<void> {
  const db = createMockDb();
  if (window.localStorage.getItem(MOCK_MEMBERSHIPS_KEY) === 'two')
    db.otherOrganizations = [otherOrganization()];
  const worker = setupWorker(...createHandlers(db));
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
/* v8 ignore stop */
