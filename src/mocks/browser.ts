import { setupWorker } from 'msw/browser';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { createHandlers, createMockDb, freshAccount } from '@/mocks/handlers';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

/* v8 ignore start -- a Service Worker only runs in a real browser: the Playwright build with VITE_MOCKS covers it. */
/**
 * Set before the demo loads (the Playwright journeys do): `two`, the person belongs to two organizations; `none`, a
 * fresh account in no organization, with nothing set up yet.
 */
const MOCK_MEMBERSHIPS_KEY = 'ostrom.mock.memberships';

export async function startMocks(): Promise<void> {
  const db = createMockDb();
  const memberships = safeLocalStorage.getItem(MOCK_MEMBERSHIPS_KEY);
  if (memberships === 'two') db.otherOrganizations = [otherOrganization()];
  if (memberships === 'none') freshAccount(db);
  const worker = setupWorker(...createHandlers(db));
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
/* v8 ignore stop */
