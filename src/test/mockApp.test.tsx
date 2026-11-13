// SPDX-License-Identifier: Apache-2.0
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

/** Whether a call reads the receipts, as `/receipts` does: a read kept on the default retry (`retryOnce`). */
function readsReceipts(request: Request): boolean {
  return new URL(request.url).pathname.endsWith('/api/v1/receipts');
}

/** The receipts read fails as a server down: `retryOnce` asks once more, a second later. */
function receiptsDown(): void {
  server.use(
    http.get('*/api/v1/receipts', () =>
      HttpResponse.json({ error: { type: 'internal', message: 'down' } }, { status: 500 }),
    ),
  );
}

// In this order too: the first shows the retry exists, the second ends with one to come, the third waits for it.
describe('a retry left by a test that ended', () => {
  it('is how a failed read of the receipts goes: asked once more, a second later', async () => {
    let asked = 0;
    traffic.onRequest((request) => {
      if (readsReceipts(request)) asked += 1;
    });
    receiptsDown();
    visit('/receipts');
    await vi.waitFor(
      () => {
        expect(asked).toBe(2);
      },
      { timeout: 3_000 },
    );
  });

  it('is left by a test that ends after the first failure', async () => {
    let asked = 0;
    traffic.onRequest((request) => {
      if (readsReceipts(request)) asked += 1;
    });
    receiptsDown();
    visit('/receipts');
    await vi.waitFor(() => {
      expect(asked).toBe(1);
    });
  });

  it('never reaches the next test: no read of the receipts comes after its end', async () => {
    let asked = 0;
    traffic.onRequest((request) => {
      if (readsReceipts(request)) asked += 1;
    });
    // Past the first retry, due one second after the failure of the test above (React Query's first delay, with no
    // jitter). Its timer was set before this one, so it would fire first however loaded the runner is.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(asked).toBe(0);
  });
});
