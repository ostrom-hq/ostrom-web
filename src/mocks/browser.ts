import { setupWorker } from 'msw/browser';
import { growLarge } from '@/mocks/fixtures/large';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { createHandlers, createMockDb, freshAccount } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { orgRoleOf } from '@/shared/org/roles';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

/* v8 ignore start -- a Service Worker only runs in a real browser: the Playwright build with VITE_MOCKS covers it. */
/**
 * Set before the demo loads (the Playwright journeys do): `two`, the person belongs to two organizations; `none`, a
 * fresh account in no organization, with nothing set up yet.
 */
const MOCK_MEMBERSHIPS_KEY = 'ostrom.mock.memberships';
/** Set before the demo loads: the demo person's role in Acme (`owner`, `member`…), admin otherwise. */
const MOCK_ROLE_KEY = 'ostrom.mock.role';
/** Set before the demo loads: `large`, Acme has 500 members, 2 000 rules, 10 000 lines of activity (PERF-CONSOLE). */
const MOCK_SCALE_KEY = 'ostrom.mock.scale';
/**
 * Set before the demo loads: `unlinked`, the demo person signed up by e-mail and linked no GitHub account, so a yes on
 * a pull request whose author is linked to nobody waits for that link (Q-GATES-G1 a).
 */
const MOCK_GITHUB_KEY = 'ostrom.mock.github';

/** The browser's Trusted Types factory, where it has one (Chromium). */
interface TrustedTypesFactory {
  readonly createPolicy: (
    name: string,
    rules: { readonly createScriptURL: (url: string) => string },
  ) => unknown;
}

function isTrustedTypesFactory(value: unknown): value is TrustedTypesFactory {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createPolicy' in value &&
    typeof value.createPolicy === 'function'
  );
}

/**
 * The image's CSP requires Trusted Types for scripts (audit AUDIT-SECU-WEB-2 B4), and registering a Service Worker is
 * such a sink. The demo alone, never a real build, lets through the one script it registers: MSW's own worker.
 */
function allowMockWorker(): void {
  const factory: unknown = Reflect.get(window, 'trustedTypes');
  if (!isTrustedTypesFactory(factory)) return;
  factory.createPolicy('default', {
    createScriptURL: (url) => {
      if (new URL(url, window.location.href).pathname === '/mockServiceWorker.js') return url;
      throw new TypeError(`Trusted Types: ${url} is not the demo's worker`);
    },
  });
}

export async function startMocks(): Promise<void> {
  const db = createMockDb();
  const memberships = safeLocalStorage.getItem(MOCK_MEMBERSHIPS_KEY);
  if (memberships === 'two') db.otherOrganizations = [otherOrganization()];
  if (memberships === 'none') freshAccount(db);
  const role = orgRoleOf(safeLocalStorage.getItem(MOCK_ROLE_KEY) ?? undefined);
  if (role !== undefined) setDemoRole(db, role);
  if (safeLocalStorage.getItem(MOCK_SCALE_KEY) === 'large') growLarge(db);
  if (safeLocalStorage.getItem(MOCK_GITHUB_KEY) === 'unlinked') db.providers = ['email'];
  allowMockWorker();
  const worker = setupWorker(...createHandlers(db));
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
/* v8 ignore stop */
