import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/shared/i18n/i18n';
import { useThemeStore } from '@/shared/theme/themeStore';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: 'light' });
  });

  it('pins the dark theme from light, then back', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(useThemeStore.getState().preference).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(useThemeStore.getState().preference).toBe('light');
  });
});
