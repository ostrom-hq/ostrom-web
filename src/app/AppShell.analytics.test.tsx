// SPDX-License-Identifier: Apache-2.0
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';

// The analytics chunk does not load (offline, blocked): the console still shows, without the footer or the banner.
const attempts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/app/AnalyticsLayer', () => {
  attempts.count += 1;
  throw new Error('Failed to fetch dynamically imported module');
});

describe('AppShell without its analytics chunk', () => {
  it('shows the console and nothing of analytics', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    render(<App router={router} />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    // The chunk is asked for once the first paint is done, and its failure leaves the console as it was.
    await waitFor(() => {
      expect(attempts.count).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(document.querySelector('.o-footer')).toBeEmptyDOMElement();
    });
    expect(screen.queryByRole('button', { name: /privacy/i })).not.toBeInTheDocument();
  });
});
