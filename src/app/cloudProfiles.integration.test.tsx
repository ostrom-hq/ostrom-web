// SPDX-License-Identifier: Apache-2.0
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { CLUSTER_ID, PROFILE_ID } from '@/mocks/cloudAdmin';
import { demoCapabilities } from '@/mocks/capabilities';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

const SECOND = '00000000-0000-4000-8000-0000000000aa';

function secondProfile(extra: object = {}) {
  const [first] = db.cloudProfiles;
  if (first === undefined) throw new Error('fixture');
  return { ...first, id: SECOND, name: 'big', ...extra };
}

async function form(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Start an agent' });
}

describe('starting a cloud agent on a profile', () => {
  it('runs on the only profile there is, which needs no choice, and shows it on the session', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    const start = within(await form());
    expect(await start.findByRole('combobox', { name: 'Profile' })).toHaveValue(PROFILE_ID);
    expect(start.getByLabelText('Image')).toHaveAttribute('placeholder', 'ghcr.io/acme/session:latest');
    expect(start.getByText('The profile’s own image runs: it allows no other.')).toBeVisible();
    await user.type(start.getByLabelText('What should it do?'), 'Fix it');
    await user.click(start.getByRole('button', { name: 'Start the agent' }));
    const line = (await screen.findAllByText(/profile default v2/))[0];
    expect(line).toHaveTextContent('ghcr.io/acme/session:latest');
  });

  it('asks which profile when there are several, and sends an image the profile allows', async () => {
    const user = userEvent.setup();
    db.cloudProfiles = [
      ...db.cloudProfiles,
      secondProfile({
        spec: {
          clusterId: CLUSTER_ID,
          namespace: 'ostrom',
          image: 'ghcr.io/acme/big:1',
          allowedImageOverrides: ['ghcr.io/acme/big:*', '*-debug'],
        },
      }),
    ];
    visit('/cloud');
    const start = within(await form());
    const pick = await start.findByRole('combobox', { name: 'Profile' });
    expect(pick).toHaveValue('');
    await user.type(start.getByLabelText('What should it do?'), 'Fix it');
    expect(start.getByRole('button', { name: 'Start the agent' })).toBeDisabled();
    await user.selectOptions(pick, 'big');
    expect(
      start.getByText('Empty runs the profile’s image. Allowed instead: ghcr.io/acme/big:*, *-debug.'),
    ).toBeVisible();
    await user.type(start.getByLabelText('Image'), 'ghcr.io/other:1');
    expect(start.getByRole('alert')).toHaveTextContent('This profile does not allow that image.');
    expect(start.getByRole('button', { name: 'Start the agent' })).toBeDisabled();
    await user.clear(start.getByLabelText('Image'));
    await user.type(start.getByLabelText('Image'), 'ghcr.io/acme/big:2');
    await user.click(start.getByRole('button', { name: 'Start the agent' }));
    expect((await screen.findAllByText(/profile big v2/))[0]).toHaveTextContent('ghcr.io/acme/big:2');
    await user.clear(start.getByLabelText('Image'));
    await user.type(start.getByLabelText('Image'), 'x-debug');
    expect(start.queryByRole('alert')).toBeNull();
    await user.clear(start.getByLabelText('Image'));
    await user.type(start.getByLabelText('Image'), 'ghcr.io/acme/b');
    expect(start.getByRole('alert')).toBeVisible();
  });

  it('says plainly that no profile is assigned, and what the server refused, in its own words', async () => {
    db.cloudProfiles = [];
    const user = userEvent.setup();
    visit('/cloud');
    const start = within(await form());
    expect(await start.findByText(/^No cloud profile is assigned to you/)).toBeVisible();
    expect(start.queryByRole('combobox', { name: 'Profile' })).toBeNull();
    server.use(
      http.post('*/api/v1/cloud/sessions', () =>
        HttpResponse.json({ error: { type: 'cluster_unavailable', message: 'x' } }, { status: 409 }),
      ),
    );
    await user.type(start.getByLabelText('What should it do?'), 'Fix it');
    expect(start.getByRole('button', { name: 'Start the agent' })).toBeDisabled();
    // Submitted without the button, it sends nothing either.
    fireEvent.submit(start.getByLabelText('What should it do?'));
    expect(db.cloudSessions.some((session) => session.profile !== undefined)).toBe(false);
  });

  it('starts as before on a server without profiles, and reads the profiles only when it has them', async () => {
    const user = userEvent.setup();
    const asked: string[] = [];
    const sent: unknown[] = [];
    server.use(
      http.post('*/api/v1/cloud/sessions', async ({ request }) => {
        sent.push(await request.clone().json());
        return undefined;
      }),
      http.get('*/api/v1/capabilities', () =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'runners.cloud.profiles.v1')),
        ),
      ),
      http.get('*/api/v1/cloud/profiles', ({ request }) => {
        asked.push(request.url);
        return undefined;
      }),
    );
    visit('/cloud');
    const start = within(await form());
    await user.type(start.getByLabelText('What should it do?'), 'Fix it');
    expect(start.queryByRole('combobox', { name: 'Profile' })).toBeNull();
    await user.click(start.getByRole('button', { name: 'Start the agent' }));
    await waitFor(() => {
      expect(db.cloudSessions[0]?.id).toBe(`cs-${String(db.cloudSessions.length + 99)}`);
    });
    expect(sent).toEqual([{ agent: 'claude', prompt: 'Fix it' }]);
    expect(asked).toEqual([]);
  });

  it('waits for the profiles, and says when they could not be read', async () => {
    server.use(http.get('*/api/v1/cloud/profiles', async () => delay('infinite')));
    visit('/cloud');
    const start = within(await form());
    expect(await start.findByText('Reading the profiles you may use…')).toBeVisible();
    expect(start.getByRole('button', { name: 'Start the agent' })).toBeDisabled();
  });

  it('shows the failure of the profiles when they could not be read', async () => {
    server.use(
      http.get('*/api/v1/cloud/profiles', () =>
        HttpResponse.json(
          { error: { type: 'internal', message: 'The profiles are unavailable.' } },
          { status: 500 },
        ),
      ),
    );
    visit('/cloud');
    expect(
      await within(await form()).findByText('The profiles are unavailable.', {}, { timeout: 5000 }),
    ).toBeVisible();
  });

  it.each([
    ['cloud_profile_not_found', 404, 'That profile no longer exists. Pick another.'],
    ['profile_unassigned', 403, 'That profile is not assigned to you.'],
    ['image_not_allowed', 403, 'That profile does not allow this image.'],
    ['profile_required', 422, 'Pick the profile to run on: you may use none or several.'],
    [
      'cluster_unavailable',
      409,
      'The profile’s cluster is not available: it is gone, or its credentials must be entered again.',
    ],
    ['namespace_not_allowed', 409, 'The profile’s cluster no longer allows its namespace.'],
  ])('says %s in plain words', async (code, status, words) => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/sessions', () =>
        HttpResponse.json({ error: { type: code, message: 'raw' } }, { status }),
      ),
    );
    visit('/cloud');
    const start = within(await form());
    await start.findByRole('combobox', { name: 'Profile' });
    await user.type(start.getByLabelText('What should it do?'), 'Fix it');
    await user.click(start.getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByText(words)).toBeVisible();
  });

  it('says another failure in the server’s words', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/sessions', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'Boom.' } }, { status: 500 }),
      ),
    );
    visit('/cloud');
    const start = within(await form());
    await start.findByRole('combobox', { name: 'Profile' });
    await user.type(start.getByLabelText('What should it do?'), 'Fix it');
    await user.click(start.getByRole('button', { name: 'Start the agent' }));
    expect(await screen.findByText('Boom.')).toBeVisible();
  });
});

describe('the clusters, one of which is the server’s own', () => {
  it('shows an in-cluster cluster as such, and does not ask for credentials it reads from its pod', async () => {
    db.instanceAdmin = true;
    db.cloudClusters = db.cloudClusters.map((cluster) => ({
      ...cluster,
      inCluster: true,
      caCertificate: { configured: false },
      serviceAccountToken: { configured: false },
    }));
    const user = userEvent.setup();
    visit('/cloud/admin');
    const clusters = within(await screen.findByRole('region', { name: 'Clusters' }));
    expect(
      await clusters.findByText('The server’s own cluster: credentials read from its pod'),
    ).toBeVisible();
    expect(clusters.queryByText('Token not set')).toBeNull();
    await user.click(clusters.getByRole('button', { name: 'Edit eu-west' }));
    const edit = within(await screen.findByRole('form', { name: 'eu-west' }));
    await user.type(edit.getByLabelText('Name'), '2');
    await user.click(edit.getByRole('button', { name: 'Save' }));
    expect(await clusters.findByText('eu-west2')).toBeVisible();
  });
});
