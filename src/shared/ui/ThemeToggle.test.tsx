import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/shared/i18n/i18n';
import { useThemeStore } from '@/shared/theme/themeStore';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: 'system' });
  });

  it('cycles system, light, dark and back to system', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Theme: system. Switch to light' }));
    expect(useThemeStore.getState().preference).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Theme: light. Switch to dark' }));
    expect(useThemeStore.getState().preference).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Theme: dark. Switch to system' }));
    expect(useThemeStore.getState().preference).toBe('system');
  });
});
