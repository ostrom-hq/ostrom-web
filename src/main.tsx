// The CSP forbids eval: zod is set to never use it, before any schema is built (audit S2-09).
import '@/shared/lib/zodConfig';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';
import { configureApiClient } from '@/shared/api/apiClient';
import { useAuthStore } from '@/shared/auth/authStore';
import { parseEnv } from '@/shared/config/env';
import '@/shared/i18n/i18n';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/azeret-mono';
import '@/shared/theme/tokens.css';
import '@/shared/theme/base.css';
import '@/shared/ui/ui.css';
import '@/app/shell.css';

const env = parseEnv(import.meta.env);

configureApiClient({ baseUrl: env.apiBaseUrl, getToken: () => useAuthStore.getState().token });

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
  if (env.mocks) await startMocksOrWarn();
  createRoot(container).render(
    <StrictMode>
      <App router={createAppRouter()} mocks={env.mocks} />
    </StrictMode>,
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element in index.html');
void boot(container);
