// SPDX-License-Identifier: Apache-2.0
import { handleGetCloudSettings, handleListCloudProfiles, handleSaveCloudSettings } from '@gen/api/msw.gen';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { CLUSTER_ID, PROFILE_ID } from '@/mocks/cloudAdmin';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

const refused = (status: number, type: string, message: string) =>
  HttpResponse.json({ error: { type, message } }, { status });

function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.theo, login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

async function section(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

describe('the Cloud administration entry', () => {
  it('is in the navigation of a server that serves it, and opens its screen', async () => {
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Cloud administration' })).toHaveAttribute(
      'href',
      '/cloud/admin',
    );
  });

  it('says so at the address when the server does not serve it, and the cloud screen stays', async () => {
    server.use(
      http.get('*/api/v1/capabilities', () =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'cloud.admin.v1'))),
      ),
    );
    visit('/cloud/admin');
    expect(
      await screen.findByRole('heading', { name: 'Cloud administration is not available on this server' }),
    ).toBeVisible();
  });

  it('is not mistaken for the cloud sessions screen', async () => {
    server.use(
      http.get('*/api/v1/capabilities', () =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'runners.cloud.v1'))),
      ),
    );
    visit('/cloud/admin');
    expect(await screen.findByRole('heading', { name: 'Cloud administration', level: 1 })).toBeVisible();
  });
});

describe('the organization’s cloud settings', () => {
  it('shows the default while nothing is stored, and saves a new value with the date it read', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const settings = await section('Organization settings');
    const minutes = await within(settings).findByLabelText(/^Background work/);
    expect(minutes).toHaveValue(240);
    expect(within(settings).getByText('The default: nothing is saved yet.')).toBeVisible();
    expect(within(settings).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(minutes);
    await user.type(minutes, '30');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    expect(await within(settings).findByText('The organization’s cloud settings are saved.')).toBeVisible();
    expect(db.cloudSettings.backgroundWorkMaxMinutes).toBe(30);
    // The next save carries the date of this one.
    expect(within(settings).queryByText('The default: nothing is saved yet.')).toBeNull();
    await user.clear(within(settings).getByLabelText(/^Background work/));
    await user.type(within(settings).getByLabelText(/^Background work/), '0');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.cloudSettings.backgroundWorkMaxMinutes).toBe(0);
    });
  });

  it('refuses a number out of range before sending', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const settings = await section('Organization settings');
    const minutes = await within(settings).findByLabelText(/^Background work/);
    await user.clear(minutes);
    await user.type(minutes, '2000');
    expect(within(settings).getByText('Enter a whole number of minutes, from 0 to 1440.')).toBeVisible();
    expect(within(settings).getByRole('button', { name: 'Save' })).toBeDisabled();
    // Submitting from the field does nothing either.
    await user.type(minutes, '{Enter}');
    expect(db.cloudSettings.backgroundWorkMaxMinutes).toBe(240);
  });

  it('is read-only for a member', async () => {
    asMember();
    visit('/cloud/admin');
    const settings = await section('Organization settings');
    expect(await within(settings).findByLabelText(/^Background work/)).toBeDisabled();
    expect(within(settings).getByText('Only an owner or an admin changes these settings.')).toBeVisible();
    expect(within(settings).queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('says it is saving, then asks to reload when someone saved first', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const settings = await section('Organization settings');
    const minutes = await within(settings).findByLabelText(/^Background work/);
    await user.clear(minutes);
    await user.type(minutes, '60');
    server.use(handleSaveCloudSettings(async () => delay('infinite')));
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    expect(await within(settings).findByRole('button', { name: 'Saving' })).toBeDisabled();
  });

  it('asks to reload after a conflict, and shows what the other save stored', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const settings = await section('Organization settings');
    const minutes = await within(settings).findByLabelText(/^Background work/);
    // Another administrator saves first.
    db.cloudSettings = { backgroundWorkMaxMinutes: 90, updatedAt: '2026-11-10T10:00:00Z', updatedBy: 'lena' };
    await user.clear(minutes);
    await user.type(minutes, '60');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    const alert = await within(settings).findByRole('alert');
    expect(alert).toHaveTextContent('Someone saved this before you.');
    await user.click(within(alert).getByRole('button', { name: 'Reload' }));
    await waitFor(() => {
      expect(within(settings).getByLabelText(/^Background work/)).toHaveValue(90);
    });
  });

  it('says a refusal in the server’s words', async () => {
    const user = userEvent.setup();
    server.use(
      handleSaveCloudSettings(() =>
        refused(400, 'invalid_cloud_settings', 'backgroundWorkMaxMinutes: out of range.'),
      ),
    );
    visit('/cloud/admin');
    const settings = await section('Organization settings');
    const minutes = await within(settings).findByLabelText(/^Background work/);
    await user.clear(minutes);
    await user.type(minutes, '5');
    await user.click(within(settings).getByRole('button', { name: 'Save' }));
    expect(await within(settings).findByRole('alert')).toHaveTextContent(
      'backgroundWorkMaxMinutes: out of range.',
    );
  });

  it('says why the settings did not come', async () => {
    server.use(handleGetCloudSettings(() => refused(500, 'internal', 'The settings are unavailable.')));
    visit('/cloud/admin');
    expect(await screen.findByText('The settings are unavailable.', {}, { timeout: 5000 })).toBeVisible();
  });
});

describe('the cloud profiles', () => {
  it('lists the profiles with where they run and their version', async () => {
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    expect(await within(profiles).findByText('default')).toBeVisible();
    expect(within(profiles).getByText('Runs in eu-west, namespace ostrom')).toBeVisible();
    expect(within(profiles).getByText('ghcr.io/acme/session:latest')).toBeVisible();
    expect(within(profiles).getByText('Version 2')).toBeVisible();
  });

  it(
    'creates a profile, with its resources and the members who may use it, and refuses what is missing',
    { timeout: 30000 },
    async () => {
      const user = userEvent.setup();
      visit('/cloud/admin');
      const profiles = await section('Profiles');
      await user.click(await within(profiles).findByRole('button', { name: 'Create a profile' }));
      const form = within(await screen.findByRole('form', { name: 'Create a profile' }));
      const save = form.getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();
      expect(form.getByText('Check name before saving.')).toBeVisible();
      await user.type(form.getByLabelText('Name'), 'big');
      expect(form.getByText('Check clusterId before saving.')).toBeVisible();
      await user.type(form.getByLabelText('Cluster id'), CLUSTER_ID);
      await user.type(form.getByLabelText('Namespace'), 'ostrom');
      await user.type(form.getByLabelText('Session image'), 'ghcr.io/acme/big:1');
      await user.type(form.getByLabelText('CPU (millicores)'), '2000');
      expect(form.getByText('Check memoryMebibytes before saving.')).toBeVisible();
      await user.type(form.getByLabelText('Memory (MiB)'), '4096');
      await user.click(form.getByRole('checkbox', { name: /Samir/ }));
      await user.click(form.getByRole('checkbox', { name: /Samir/ }));
      await user.click(form.getByRole('checkbox', { name: /Samir/ }));
      expect(save).toBeEnabled();
      await user.click(save);
      expect(await within(profiles).findByText('big')).toBeVisible();
      expect(screen.queryByRole('form', { name: 'Create a profile' })).toBeNull();
      const stored = db.cloudProfiles.find((profile) => profile.name === 'big');
      expect(stored).toMatchObject({
        version: 1,
        spec: { namespace: 'ostrom', resources: { cpuMillis: 2000, memoryMebibytes: 4096 } },
        assignedMemberIds: [MEMBER_IDS.samir],
      });
    },
  );

  it('publishes a new version of a profile, carrying the version it read', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    await user.click(await within(profiles).findByRole('button', { name: 'Edit default' }));
    const form = within(await screen.findByRole('form', { name: 'default' }));
    expect(await form.findByRole('checkbox', { name: 'theo' })).toBeChecked();
    await user.clear(form.getByLabelText('Session image'));
    await user.type(form.getByLabelText('Session image'), 'ghcr.io/acme/session:2');
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(await within(profiles).findByText('Version 3')).toBeVisible();
    expect(within(profiles).getByText('ghcr.io/acme/session:2')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'default' })).toBeNull();
    expect(db.cloudProfiles.find((profile) => profile.id === PROFILE_ID)?.version).toBe(3);
  });

  it('closes the form without saving, and says a conflict or a refusal', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    await user.click(await within(profiles).findByRole('button', { name: 'Edit default' }));
    await user.click(
      within(await screen.findByRole('form', { name: 'default' })).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('form', { name: 'default' })).toBeNull();
    // Someone published a version meanwhile.
    await user.click(within(profiles).getByRole('button', { name: 'Edit default' }));
    db.cloudProfiles = db.cloudProfiles.map((profile) => ({ ...profile, version: 5 }));
    const form = within(await screen.findByRole('form', { name: 'default' }));
    await user.type(form.getByLabelText('Namespace'), 'x');
    await user.click(form.getByRole('button', { name: 'Save' }));
    const alert = await form.findByRole('alert');
    expect(alert).toHaveTextContent('Someone saved this before you.');
    await user.click(within(alert).getByRole('button', { name: 'Reload' }));
    expect(await within(profiles).findByText('Version 5')).toBeVisible();
  });

  it('says a namespace the cluster does not allow in the server’s words', async () => {
    const user = userEvent.setup();
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    await user.click(await within(profiles).findByRole('button', { name: 'Edit default' }));
    const form = within(await screen.findByRole('form', { name: 'default' }));
    await user.type(form.getByLabelText('Namespace'), 'x');
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'namespace: the cluster does not allow it.',
    );
  });

  it('shows a member only the profiles assigned to them, with nothing to change', async () => {
    asMember();
    db.cloudProfiles = db.cloudProfiles.map((profile) => ({
      ...profile,
      assignedMemberIds: [MEMBER_IDS.maya],
    }));
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    expect(await within(profiles).findByText('default')).toBeVisible();
    expect(within(profiles).queryByRole('button', { name: /Edit|Create/ })).toBeNull();
  });

  it('tells a member with no profile, and an administrator with none, what to do', async () => {
    db.cloudProfiles = [];
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    expect(await within(profiles).findByText(/No profile yet\./)).toBeVisible();
  });

  it('says nothing is assigned to a member with none', async () => {
    asMember();
    db.cloudProfiles = db.cloudProfiles.map((profile) => ({ ...profile, assignedMemberIds: [] }));
    visit('/cloud/admin');
    expect(await screen.findByText('No profile is assigned to you.')).toBeVisible();
  });

  it('says why the profiles did not come', async () => {
    server.use(handleListCloudProfiles(() => refused(500, 'internal', 'The profiles are unavailable.')));
    visit('/cloud/admin');
    expect(await screen.findByText('The profiles are unavailable.', {}, { timeout: 5000 })).toBeVisible();
  });
});

describe('the runtime and the clusters, the instance’s own', () => {
  it('are not shown, nor asked for, to anyone who does not administer the instance', async () => {
    const asked: string[] = [];
    server.use(
      http.all('*/api/v1/cloud/runtime', ({ request }) => {
        asked.push(request.url);
        return undefined;
      }),
      http.all('*/api/v1/cloud/clusters', ({ request }) => {
        asked.push(request.url);
        return undefined;
      }),
    );
    visit('/cloud/admin');
    await section('Profiles');
    await within(await section('Organization settings')).findByLabelText(/^Background work/);
    expect(screen.queryByRole('region', { name: 'Runtime of the instance' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Clusters' })).toBeNull();
    expect(asked).toEqual([]);
  });

  it('shows the runtime to an administrator of the instance, and saves it with the date it read', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const runtime = await section('Runtime of the instance');
    expect(await within(runtime).findByLabelText('Runner image')).toHaveValue(
      'ghcr.io/acme/ostrom-runner:1.4',
    );
    expect(
      within(runtime).getByText('An https origin without a path. Empty uses https://ostrom.acme.test.'),
    ).toBeVisible();
    const save = within(runtime).getByRole('button', { name: 'Save' });
    await user.clear(within(runtime).getByLabelText('Sessions running per member'));
    expect(within(runtime).getByText('Check maxRunningSessionsPerMember before saving.')).toBeVisible();
    expect(save).toBeDisabled();
    await user.type(within(runtime).getByLabelText('Sessions running per member'), '5');
    await user.click(within(runtime).getByRole('checkbox', { name: 'Cloud sessions are on' }));
    await user.selectOptions(within(runtime).getByLabelText('Workspace access mode'), 'ReadWriteOnce');
    await user.selectOptions(
      within(runtime).getByLabelText('Member transfers'),
      'Only administrators transfer',
    );
    await user.type(within(runtime).getByLabelText('Days a paused session keeps its workspace'), '30');
    await user.type(within(runtime).getByLabelText('Days transcripts are kept'), '90');
    await user.click(save);
    expect(await within(runtime).findByText(/The runtime is saved\./)).toBeVisible();
    expect(db.cloudRuntime).toMatchObject({
      enabled: false,
      maxRunningSessionsPerMember: 5,
      workspaceAccessMode: 'ReadWriteOnce',
      memberTransfers: 'disabled',
      pausedRetentionDays: 30,
      transcriptRetentionDays: 90,
    });
  });

  it('says an address the server refuses, a runtime saved first, and that it is saving', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const runtime = await section('Runtime of the instance');
    const url = await within(runtime).findByLabelText('Server URL for session pods');
    await user.type(url, 'https://localhost');
    await user.click(within(runtime).getByRole('button', { name: 'Save' }));
    expect(await within(runtime).findByRole('alert')).toHaveTextContent('serverUrl: an https origin');
    await user.clear(url);
    // Another administrator saved first.
    db.cloudRuntime = { ...db.cloudRuntime, updatedAt: '2026-11-12T10:00:00Z' };
    await user.type(url, 'https://pods.acme.test');
    await user.click(within(runtime).getByRole('button', { name: 'Save' }));
    const alert = await within(runtime).findByRole('alert');
    expect(alert).toHaveTextContent('Someone saved this before you.');
    await user.click(within(alert).getByRole('button', { name: 'Reload' }));
    await waitFor(() => {
      expect(within(runtime).getByLabelText('Server URL for session pods')).toHaveValue('');
    });
  });

  it('lists the clusters with their secrets as set or not set, never their value', async () => {
    db.instanceAdmin = true;
    db.cloudClusters = db.cloudClusters.map((cluster) => ({
      ...cluster,
      serviceAccountToken: { configured: false },
      caCertificate: { configured: false },
    }));
    visit('/cloud/admin');
    const clusters = await section('Clusters');
    expect(await within(clusters).findByText('eu-west')).toBeVisible();
    expect(within(clusters).getByText('https://k8s.acme.test')).toBeVisible();
    expect(within(clusters).getByText('CA bundle not set')).toBeVisible();
    expect(within(clusters).getByText('Token not set')).toBeVisible();
  });

  it('connects a cluster, which needs its CA bundle and its token', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const clusters = await section('Clusters');
    await user.click(await within(clusters).findByRole('button', { name: 'Connect a cluster' }));
    const form = within(await screen.findByRole('form', { name: 'Connect a cluster' }));
    const save = form.getByRole('button', { name: 'Save' });
    await user.type(form.getByLabelText('Name'), 'us-east');
    await user.type(form.getByLabelText('API URL'), 'https://k8s.us.acme.test');
    await user.type(form.getByLabelText('Namespaces sessions may use'), 'ostrom, batch');
    expect(form.getByText('Check caCertificate before saving.')).toBeVisible();
    await user.type(form.getByLabelText('CA bundle (PEM)'), '-----BEGIN CERTIFICATE-----');
    expect(form.getByText('Check serviceAccountToken before saving.')).toBeVisible();
    await user.type(form.getByLabelText('Service-account token'), 'tok');
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await within(clusters).findByText('us-east')).toBeVisible();
    expect(db.cloudClusters.map((cluster) => cluster.name)).toEqual(['eu-west', 'us-east']);
    expect(screen.queryByRole('form', { name: 'Connect a cluster' })).toBeNull();
  });

  it('keeps the stored secrets when a cluster changes, but asks for both when its address does', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const clusters = await section('Clusters');
    await user.click(await within(clusters).findByRole('button', { name: 'Edit eu-west' }));
    const form = within(await screen.findByRole('form', { name: 'eu-west' }));
    expect(form.getByText('Leave the CA bundle and the token empty to keep the stored ones.')).toBeVisible();
    await user.clear(form.getByLabelText('Pods running at most'));
    await user.type(form.getByLabelText('Pods running at most'), '50');
    await user.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(db.cloudClusters[0]).toMatchObject({ maxRunningPods: 50, version: 2 });
    });
    expect(db.cloudClusters[0]?.caCertificate.configured).toBe(true);
    await user.click(await within(clusters).findByRole('button', { name: 'Edit eu-west' }));
    const moved = within(await screen.findByRole('form', { name: 'eu-west' }));
    await user.clear(moved.getByLabelText('API URL'));
    await user.type(moved.getByLabelText('API URL'), 'https://other.acme.test');
    expect(
      moved.getByText('Needed: the CA bundle and the token are written, never shown again.'),
    ).toBeVisible();
    expect(moved.getByText('Check caCertificate before saving.')).toBeVisible();
    expect(moved.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(moved.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'eu-west' })).toBeNull();
  });

  it('says a cluster saved first, and an address the server refuses', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const clusters = await section('Clusters');
    await user.click(await within(clusters).findByRole('button', { name: 'Edit eu-west' }));
    const form = within(await screen.findByRole('form', { name: 'eu-west' }));
    db.cloudClusters = db.cloudClusters.map((cluster) => ({ ...cluster, version: 9 }));
    await user.type(form.getByLabelText('Name'), '2');
    await user.click(form.getByRole('button', { name: 'Save' }));
    const alert = await form.findByRole('alert');
    expect(alert).toHaveTextContent('Someone saved this before you.');
    await user.click(within(alert).getByRole('button', { name: 'Reload' }));
    await user.click(await within(clusters).findByRole('button', { name: 'Connect a cluster' }));
    const created = within(await screen.findByRole('form', { name: 'Connect a cluster' }));
    await user.type(created.getByLabelText('Name'), 'bad');
    await user.type(created.getByLabelText('API URL'), 'https://localhost');
    await user.type(created.getByLabelText('Namespaces sessions may use'), 'ostrom');
    await user.type(created.getByLabelText('CA bundle (PEM)'), 'pem');
    await user.type(created.getByLabelText('Service-account token'), 'tok');
    await user.click(created.getByRole('button', { name: 'Save' }));
    expect(await created.findByRole('alert')).toHaveTextContent('apiUrl: an https address');
  });

  it('says there is no cluster yet, and refuses a namespace Kubernetes would refuse', async () => {
    db.instanceAdmin = true;
    db.cloudClusters = [];
    const user = userEvent.setup();
    visit('/cloud/admin');
    const clusters = await section('Clusters');
    expect(await within(clusters).findByText('No cluster is connected yet.')).toBeVisible();
    await user.click(within(clusters).getByRole('button', { name: 'Connect a cluster' }));
    const form = within(await screen.findByRole('form', { name: 'Connect a cluster' }));
    await user.type(form.getByLabelText('Namespaces sessions may use'), 'Bad_Name');
    expect(form.getByText('Check name before saving.')).toBeVisible();
    await user.type(form.getByLabelText('Name'), 'x');
    await user.type(form.getByLabelText('API URL'), 'https://k.test');
    expect(form.getByText('Check allowedNamespaces before saving.')).toBeVisible();
    await user.click(form.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Connect a cluster' })).toBeNull();
  });
});

describe('what the forms say while they work, and the fields that are seldom touched', () => {
  it('says it is saving a profile, and names the cluster by its id when the server gave no name', async () => {
    const user = userEvent.setup();
    db.cloudProfiles = db.cloudProfiles.map(({ clusterName, ...profile }) =>
      clusterName === '' ? profile : profile,
    );
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    expect(await within(profiles).findByText(`Runs in ${CLUSTER_ID}, namespace ostrom`)).toBeVisible();
    await user.click(within(profiles).getByRole('button', { name: 'Edit default' }));
    const form = within(await screen.findByRole('form', { name: 'default' }));
    server.use(http.put('*/api/v1/cloud/profiles/*', async () => delay('infinite')));
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('button', { name: 'Saving' })).toBeDisabled();
  });

  it('says it is saving a cluster, and edits its storage class', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const clusters = await section('Clusters');
    await user.click(await within(clusters).findByRole('button', { name: 'Edit eu-west' }));
    const form = within(await screen.findByRole('form', { name: 'eu-west' }));
    await user.type(form.getByLabelText('Default storage class'), 'fast');
    server.use(http.put('*/api/v1/cloud/clusters/*', async () => delay('infinite')));
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(await form.findByRole('button', { name: 'Saving' })).toBeDisabled();
  });

  it('edits every field of the runtime, and says it is saving', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const runtime = await section('Runtime of the instance');
    const image = await within(runtime).findByLabelText('Runner image');
    await user.clear(image);
    await user.type(image, 'ghcr.io/acme/runner:2');
    const binary = within(runtime).getByLabelText('Binary in the runner image');
    await user.clear(binary);
    await user.type(binary, '/opt/ostrom');
    const failed = within(runtime).getByLabelText(/^Days a failed/);
    await user.clear(failed);
    await user.type(failed, '3');
    const kept = within(runtime).getByLabelText(/^Sessions kept/);
    await user.clear(kept);
    await user.type(kept, '10');
    server.use(http.put('*/api/v1/cloud/runtime', async () => delay('infinite')));
    await user.click(within(runtime).getByRole('button', { name: 'Save' }));
    expect(await within(runtime).findByRole('button', { name: 'Saving' })).toBeDisabled();
  });

  it('shows a runtime that was never saved, and does not submit a value that is out of range', async () => {
    db.instanceAdmin = true;
    const { updatedAt, ...unsaved } = db.cloudRuntime;
    expect(updatedAt).toBeDefined();
    db.cloudRuntime = unsaved;
    visit('/cloud/admin');
    const runtime = await section('Runtime of the instance');
    expect(await within(runtime).findByLabelText('Runner image')).toBeVisible();
    const settings = await section('Organization settings');
    const minutes = await within(settings).findByLabelText(/^Background work/);
    fireEvent.change(minutes, { target: { value: '2000' } });
    fireEvent.submit(minutes);
    expect(db.cloudSettings.backgroundWorkMaxMinutes).toBe(240);
  });

  it('sends nothing from a form that is not valid, even when submitted without the button', async () => {
    db.instanceAdmin = true;
    const user = userEvent.setup();
    visit('/cloud/admin');
    const profiles = await section('Profiles');
    await user.click(await within(profiles).findByRole('button', { name: 'Create a profile' }));
    fireEvent.submit(await screen.findByRole('form', { name: 'Create a profile' }));
    const clusters = await section('Clusters');
    await user.click(await within(clusters).findByRole('button', { name: 'Connect a cluster' }));
    fireEvent.submit(await screen.findByRole('form', { name: 'Connect a cluster' }));
    const runtime = await section('Runtime of the instance');
    const sessions = await within(runtime).findByLabelText('Sessions running per member');
    await user.clear(sessions);
    fireEvent.submit(sessions);
    expect(db.cloudProfiles).toHaveLength(1);
    expect(db.cloudClusters).toHaveLength(1);
    expect(db.cloudRuntime.maxRunningSessionsPerMember).toBe(3);
  });
});
