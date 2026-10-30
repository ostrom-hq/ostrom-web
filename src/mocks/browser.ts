import { setupWorker } from 'msw/browser';
import { createHandlers, createMockDb } from '@/mocks/handlers';

/* v8 ignore start -- a Service Worker only runs in a real browser: the Playwright build with VITE_MOCKS covers it. */
export async function startMocks(): Promise<void> {
  const worker = setupWorker(...createHandlers(createMockDb()));
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
/* v8 ignore stop */
