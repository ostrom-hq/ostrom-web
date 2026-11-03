// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { DEMO_GITHUB_CONSENT } from '@/mocks/account';
import { exit } from '@/shared/lib/leave';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

/** How late the link answers: after the first test has ended, well before the second one does. */
const LATE = 150;

// The two tests run in this order (no shuffle): the first leaves a call in flight, the second watches for its answer.
describe('a call still in flight when its test ends', () => {
  it('is left waiting by a test that ends before the answer', async () => {
    const user = userEvent.setup();
    vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    db.providers = ['email'];
    server.use(
      http.post('*/api/v1/auth/:provider/link', async () => {
        await delay(LATE);
        return HttpResponse.json({ authorizationUrl: DEMO_GITHUB_CONSENT });
      }),
    );
    visit('/account');
    const github = await screen.findByRole('region', { name: 'GitHub' });
    await user.click(await within(github).findByRole('button', { name: 'Link GitHub' }));
    // Ends here, the answer still to come.
    expect(within(github).getByRole('button', { name: 'Opening GitHub…' })).toBeDisabled();
  });

  it('never acts in the next test: its late answer does not leave for GitHub', async () => {
    const assign = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, LATE * 3));
    expect(assign).not.toHaveBeenCalled();
  });
});
