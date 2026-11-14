// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupMockApp, visit } from '@/test/mockApp';

setupMockApp();

describe('the navigation menu (a phone has no room for the bar)', () => {
  it('lists every screen of the bar, modal, and Escape gives the focus back to its button', async () => {
    const user = userEvent.setup();
    visit('/yes');
    const button = await screen.findByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const bar = screen.getByRole('navigation', { name: 'Main' });
    // "Waiting for you" says how many wait: the menu is opened once that count is in.
    await within(bar).findByRole('link', { name: /^Waiting for you 3 open$/ });
    // An owner's or an admin's entry comes once the role in the organization is read.
    await within(bar).findByRole('link', { name: 'Webhooks' });
    const screens = within(bar)
      .getAllByRole('link')
      .map((link) => link.textContent);

    await user.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    // The rest of the console is out of reach while it is open.
    expect(bar.closest('[inert]')).not.toBeNull();
    const listed = within(dialog).getAllByRole('link');
    expect(listed.map((link) => link.textContent)).toEqual(screens);
    expect(within(dialog).getByRole('link', { name: 'Requests' })).toHaveAttribute('aria-current', 'page');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
    expect(bar.closest('[inert]')).toBeNull();
  });

  it('closes with its Close button', async () => {
    const user = userEvent.setup();
    visit('/yes');
    await user.click(await screen.findByRole('button', { name: 'Menu' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Close' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the screen chosen and closes', async () => {
    const user = userEvent.setup();
    const router = visit('/yes');
    await user.click(await screen.findByRole('button', { name: 'Menu' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('link', { name: 'Sessions' }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sessions');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
