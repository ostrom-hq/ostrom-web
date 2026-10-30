import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';

describe('App', () => {
  it('renders the shell and the home screen', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    render(<App router={router} />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Every agent change, approved by the right person.',
    );
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
