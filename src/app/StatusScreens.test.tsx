import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';
import { ErrorScreen } from '@/app/StatusScreens';

describe('status screens', () => {
  it('shows a localized not-found page for an unknown path', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/nowhere'] }));
    render(<App router={router} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Nothing here');
    expect(screen.getByRole('link', { name: 'Back to the console' })).toHaveAttribute('href', '/');
  });

  it('announces a failed screen', () => {
    render(<ErrorScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
  });
});
