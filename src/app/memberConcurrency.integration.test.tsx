// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

/** The paths the console asks for from now on. */
function watch(): string[] {
  const paths: string[] = [];
  traffic.onRequest((request) => {
    paths.push(new URL(request.url).pathname);
  });
  return paths;
}

function fieldOf(name: string): HTMLElement {
  return screen.getByRole('spinbutton', { name: `Concurrent requests of ${name} (0 = unlimited)` });
}

async function shown(): Promise<void> {
  await screen.findByText('Samir Haddad');
  await waitFor(() => {
    expect(fieldOf('Samir Haddad')).toBeInTheDocument();
  });
}

function limits(): Record<string, number> | undefined {
  return db.inferenceSettings[db.organization.id]?.memberConcurrency;
}

describe('the concurrent requests of a member (TeamCode’s member policy)', () => {
  it('is unlimited for everyone until an administrator gives a limit, and 0 makes it unlimited again', async () => {
    const user = userEvent.setup();
    visit('/members');
    await shown();
    expect(fieldOf('Samir Haddad')).toHaveValue(0);
    expect(fieldOf('Samir Haddad')).toHaveAccessibleDescription(/more requests wait in the queue/);
    await user.clear(fieldOf('Samir Haddad'));
    await user.type(fieldOf('Samir Haddad'), '4');
    await user.tab();
    await waitFor(() => {
      expect(limits()).toEqual({ [MEMBER_IDS.samir]: 4 });
    });
    // The providers' keys are written back as they were.
    expect(db.inferenceSettings[db.organization.id]?.anthropicKeySecret).toBe('ANTHROPIC_API_KEY');
    await waitFor(() => {
      expect(fieldOf('Samir Haddad')).toHaveValue(4);
    });
    expect(fieldOf('theo')).toHaveValue(0);

    await user.clear(fieldOf('Samir Haddad'));
    await user.type(fieldOf('Samir Haddad'), '0{Enter}');
    await waitFor(() => {
      expect(limits()).toEqual({});
    });
  });

  it('goes back to the saved limit for a value out of 0 to 32, and sends nothing for the same one', async () => {
    const user = userEvent.setup();
    db.inferenceSettings[db.organization.id] = {
      useSharedAccounts: true,
      memberConcurrency: { [MEMBER_IDS.samir]: 2 },
    };
    const paths = watch();
    visit('/members');
    await shown();
    await waitFor(() => {
      expect(fieldOf('Samir Haddad')).toHaveValue(2);
    });
    for (const typed of ['40', '1.5']) {
      await user.clear(fieldOf('Samir Haddad'));
      await user.type(fieldOf('Samir Haddad'), typed);
      await user.tab();
      expect(fieldOf('Samir Haddad')).toHaveValue(2);
    }
    await user.clear(fieldOf('Samir Haddad'));
    await user.tab();
    expect(fieldOf('Samir Haddad')).toHaveValue(2);
    await user.type(fieldOf('Samir Haddad'), 'x');
    await user.tab();
    expect(paths.filter((path) => path === '/api/v1/inference/settings')).toHaveLength(1);
    expect(limits()).toEqual({ [MEMBER_IDS.samir]: 2 });
  });

  it('holds the field being saved until the server answers, and says why a save failed', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/inference/settings', async () => {
        await delay(150);
        return HttpResponse.json({ error: { type: 'forbidden', message: 'Not for you.' } }, { status: 403 });
      }),
    );
    visit('/members');
    await shown();
    await user.clear(fieldOf('Samir Haddad'));
    await user.type(fieldOf('Samir Haddad'), '3{Enter}');
    await waitFor(() => {
      expect(fieldOf('Samir Haddad')).toBeDisabled();
    });
    expect(fieldOf('theo')).toBeEnabled();
    expect(await screen.findByText('Not for you.')).toBeInTheDocument();
    expect(fieldOf('Samir Haddad')).toBeEnabled();
  });

  it('is not offered to a member who is not an administrator', async () => {
    setDemoRole(db, 'member');
    const paths = watch();
    visit('/members');
    await screen.findByText('Samir Haddad');
    expect(screen.queryByText('Concurrent requests (0 = unlimited)')).toBeNull();
    expect(paths).not.toContain('/api/v1/inference/settings');
  });

  it('is hidden where the server has no admission queue', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'inference.queue.v1'))),
      ),
    );
    const paths = watch();
    visit('/members');
    await screen.findByText('Samir Haddad');
    expect(screen.queryByText('Concurrent requests (0 = unlimited)')).toBeNull();
    expect(paths).not.toContain('/api/v1/inference/settings');
  });
});
