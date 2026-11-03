// The CSP forbids eval: zod is set to never use it, before any schema is built (audit S2-09).
import '@/shared/lib/zodConfig';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';
import { configureApiClient } from '@/shared/api/apiClient';
import { parseEnv } from '@/shared/config/env';
import { i18nReady } from '@/shared/i18n/i18n';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/azeret-mono';
import '@/shared/theme/tokens.css';
import '@/shared/theme/base.css';
import '@/shared/ui/ui.css';
import '@/app/shell.css';

const env = parseEnv(import.meta.env);

configureApiClient({ baseUrl: env.apiBaseUrl });

async function startMocksOrWarn(): Promise<void> {
  try {
    const { startMocks } = await import('@/mocks/browser');
    await startMocks();
  } catch (error) {
    // Render anyway: the screens show their offline state instead of a blank page.
    console.error('Ostrom: the mock API could not start', error);
  }
}

async function boot(container: HTMLElement): Promise<void> {
  // Read as the build wrote it, not through `env`: Vite then drops the mock API (handlers and demo data) from a build
  // without VITE_MOCKS, instead of shipping it unused (audit AUDIT-SECU-WEB-2 B7). `env.mocks` says the same.
  // The wording of the language shown comes in its own chunk, asked for as the entry runs: the console renders once it
  // is in, so the first screen is in the person's language from its first paint (no bare keys, no English then French).
  await Promise.all([i18nReady, import.meta.env.VITE_MOCKS === 'true' ? startMocksOrWarn() : undefined]);
  createRoot(container).render(
    <StrictMode>
      <App router={createAppRouter()} mocks={env.mocks} />
    </StrictMode>,
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element in index.html');
void boot(container);
