import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';
import '@/shared/i18n/i18n';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/azeret-mono';
import '@/shared/theme/tokens.css';
import '@/shared/theme/base.css';
import '@/shared/ui/ui.css';
import '@/app/shell.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <App router={createAppRouter()} />
  </StrictMode>,
);
