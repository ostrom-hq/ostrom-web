// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { DEMO_GITHUB_CONSENT } from '@/mocks/account';
import { exit } from '@/shared/lib/leave';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

/** Holds the link's answer until the second test lets it go: nothing here depends on how late it comes. */
let release: () => void = () => undefined;
const held = new Promise<void>((resolve) => {
  release = resolve;
});

// The two tests run in this order (no shuffle): the first leaves a call in flight, the second lets its answer come.
describe('a call still in flight when its test ends', () => {
  it('is left waiting by a test that ends before the answer', async () => {
    const user = userEvent.setup();
    vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    db.providers = ['email'];
    server.use(
      http.post('*/api/v1/auth/:provider/link', async () => {
        await held;
        return HttpResponse.json({ authorizationUrl: DEMO_GITHUB_CONSENT });
      }),
    );
    visit('/account');
    const github = await screen.findByRole('region', { name: 'GitHub' });
    await user.click(await within(github).findByRole('button', { name: 'Link GitHub' }));
    // Ends here, the answer held.
    expect(within(github).getByRole('button', { name: 'Opening GitHub…' })).toBeDisabled();
  });

  it('never acts in the next test: its answer, let go now, does not leave for GitHub', async () => {
    const assign = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    release();
    // Without the call off, the answer reaches this test's spy within a few ticks.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(assign).not.toHaveBeenCalled();
  });
});
