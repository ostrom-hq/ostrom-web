// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { DEMO_GITHUB_CONSENT } from '@/mocks/account';
import { exit } from '@/shared/lib/leave';
import { held } from '@/test/handlerFetch';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

/** Holds the link's answer until the second test lets it go: nothing here depends on how late it comes. */
let release: () => void = () => undefined;
const gate = new Promise<void>((resolve) => {
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
        await held(gate);
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

/** Whether a call reads the person's account, as `/account` does: the read retried after a failure. */
function readsAccount(request: Request): boolean {
  return new URL(request.url).pathname.endsWith('/api/v1/auth/me/account');
}

// In this order too: the first ends with a read that failed once and would be retried (`retryOnce`, after a second).
describe('a retry left by a test that ended', () => {
  it('is left by a test that ends after the first failure', async () => {
    let asked = 0;
    traffic.onRequest((request) => {
      if (readsAccount(request)) asked += 1;
    });
    server.use(
      http.get('*/api/v1/auth/me/account', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'down' } }, { status: 500 }),
      ),
    );
    visit('/account');
    await vi.waitFor(() => {
      expect(asked).toBe(1);
    });
  });

  it('never reaches the next test: no read of the account comes after its end', async () => {
    let asked = 0;
    traffic.onRequest((request) => {
      if (readsAccount(request)) asked += 1;
    });
    // Well beyond the delay of the first retry (one second in TanStack Query).
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(asked).toBe(0);
  });
});
