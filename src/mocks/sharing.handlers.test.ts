// SPDX-License-Identifier: AGPL-3.0-only
import {
  deleteArtifact,
  enrollSharedAccount,
  listArtifactMembers,
  listArtifacts,
  listArtifactVersions,
  listSharedAccounts,
  removeSharedAccount,
  shareArtifact,
  unshareArtifact,
  updateSharedAccount,
} from '@gen/api/sdk.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test', getToken: () => undefined });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function statusOf(call: () => Promise<unknown>): Promise<number | false | undefined> {
  try {
    await call();
  } catch (error) {
    return isApiFailure(error) && error.status;
  }
  return false;
}

describe('mock artifacts', () => {
  it('lists the artifacts, the versions and readers of one, and nothing for one without', async () => {
    expect((await listArtifacts({ throwOnError: true })).data.items.map((item) => item.id)).toEqual([
      'art-7',
      'art-5',
      'art-2',
    ]);
    const versions = await listArtifactVersions({ path: { id: 'art-7' }, throwOnError: true });
    expect(versions.data.items.map((version) => version.number)).toEqual([3, 2, 1]);
    expect((await listArtifactVersions({ path: { id: 'art-2' }, throwOnError: true })).data.items).toEqual(
      [],
    );
    expect((await listArtifactMembers({ path: { id: 'art-7' }, throwOnError: true })).data.members).toEqual([
      'maya',
      'theo',
    ]);
    expect((await listArtifactMembers({ path: { id: 'art-2' }, throwOnError: true })).data.members).toEqual(
      [],
    );
  });

  it('shares with a member once, stops sharing, and lets only the owner do either', async () => {
    await shareArtifact({ path: { id: 'art-7', memberId: 'samir' }, throwOnError: true });
    await shareArtifact({ path: { id: 'art-7', memberId: 'samir' }, throwOnError: true });
    expect(db.artifactMembers['art-7']).toEqual(['maya', 'theo', 'samir']);
    await unshareArtifact({ path: { id: 'art-7', memberId: 'theo' }, throwOnError: true });
    expect(db.artifactMembers['art-7']).toEqual(['maya', 'samir']);
    await shareArtifact({ path: { id: 'art-2', memberId: 'theo' }, throwOnError: true });
    expect(db.artifactMembers['art-2']).toEqual(['theo']);
    delete db.artifactMembers['art-2'];
    await unshareArtifact({ path: { id: 'art-2', memberId: 'theo' }, throwOnError: true });
    expect(db.artifactMembers['art-2']).toEqual([]);
    expect(
      await statusOf(async () =>
        shareArtifact({ path: { id: 'art-5', memberId: 'samir' }, throwOnError: true }),
      ),
    ).toBe(403);
    expect(
      await statusOf(async () =>
        unshareArtifact({ path: { id: 'art-5', memberId: 'theo' }, throwOnError: true }),
      ),
    ).toBe(403);
    expect(
      await statusOf(async () =>
        shareArtifact({ path: { id: 'art-7', memberId: 'nobody' }, throwOnError: true }),
      ),
    ).toBe(404);
    expect(
      await statusOf(async () =>
        shareArtifact({ path: { id: 'art-9', memberId: 'theo' }, throwOnError: true }),
      ),
    ).toBe(404);
    expect(
      await statusOf(async () =>
        unshareArtifact({ path: { id: 'art-9', memberId: 'theo' }, throwOnError: true }),
      ),
    ).toBe(404);
  });

  it('deletes an artifact for its owner only', async () => {
    expect(await statusOf(async () => deleteArtifact({ path: { id: 'art-5' }, throwOnError: true }))).toBe(
      403,
    );
    expect(await statusOf(async () => deleteArtifact({ path: { id: 'art-9' }, throwOnError: true }))).toBe(
      404,
    );
    await deleteArtifact({ path: { id: 'art-7' }, throwOnError: true });
    expect(db.artifacts.map((item) => item.id)).toEqual(['art-5', 'art-2']);
  });
});

describe('mock shared subscriptions', () => {
  it('enrolls a subscription from a stored secret, with or without a daily share', async () => {
    const lent = await enrollSharedAccount({
      body: {
        provider: 'openai',
        label: '  Team Pro ',
        credentialSecret: 'LINEAR_TOKEN',
        sharedWith: ['theo'],
        dailyAllocationUsd: 12.5,
      },
      throwOnError: true,
    });
    expect(lent.data).toMatchObject({
      id: 'acc-100',
      label: 'Team Pro',
      owner: 'maya',
      status: 'active',
      sharedWith: ['theo'],
      dailyAllocationUsd: 12.5,
      paused: false,
    });
    const bare = await enrollSharedAccount({
      body: { provider: 'anthropic', label: 'Bare', credentialSecret: 'LINEAR_TOKEN' },
      throwOnError: true,
    });
    expect(bare.data.sharedWith).toEqual([]);
    expect(bare.data).not.toHaveProperty('dailyAllocationUsd');
    expect((await listSharedAccounts({ throwOnError: true })).data.items).toHaveLength(4);
  });

  it('refuses a subscription without a name, a known provider or an existing secret', async () => {
    const enroll = (body: { provider: string; label: string; credentialSecret: string }) => async () =>
      enrollSharedAccount({ body, throwOnError: true });
    expect(
      await statusOf(enroll({ provider: 'anthropic', label: ' ', credentialSecret: 'LINEAR_TOKEN' })),
    ).toBe(400);
    expect(
      await statusOf(enroll({ provider: 'mistral', label: 'x', credentialSecret: 'LINEAR_TOKEN' })),
    ).toBe(400);
    expect(await statusOf(enroll({ provider: 'anthropic', label: 'x', credentialSecret: 'NOPE' }))).toBe(400);
    const notAList = await fetch('http://ostrom.test/api/v1/accounts', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'anthropic',
        label: 'x',
        credentialSecret: 'LINEAR_TOKEN',
        sharedWith: 'theo',
      }),
    });
    expect(notAList.status).toBe(400);
  });

  it('changes a subscription field by field, for its owner only', async () => {
    const paused = await updateSharedAccount({
      path: { id: 'acc-1' },
      body: { paused: true },
      throwOnError: true,
    });
    expect(paused.data).toMatchObject({
      paused: true,
      sharedWith: ['theo', 'samir'],
      dailyAllocationUsd: 40,
    });
    const changed = await updateSharedAccount({
      path: { id: 'acc-1' },
      body: { sharedWith: ['theo'], dailyAllocationUsd: 20 },
      throwOnError: true,
    });
    expect(changed.data).toMatchObject({ paused: true, sharedWith: ['theo'], dailyAllocationUsd: 20 });
    expect(
      await statusOf(async () =>
        updateSharedAccount({ path: { id: 'acc-2' }, body: { paused: false }, throwOnError: true }),
      ),
    ).toBe(403);
    expect(
      await statusOf(async () =>
        updateSharedAccount({ path: { id: 'acc-9' }, body: { paused: false }, throwOnError: true }),
      ),
    ).toBe(404);
    const notABoolean = await fetch('http://ostrom.test/api/v1/accounts/acc-1', {
      method: 'PATCH',
      body: JSON.stringify({ paused: 'yes' }),
    });
    expect(notABoolean.status).toBe(400);
  });

  it('removes a subscription for its owner only', async () => {
    expect(
      await statusOf(async () => removeSharedAccount({ path: { id: 'acc-2' }, throwOnError: true })),
    ).toBe(403);
    expect(
      await statusOf(async () => removeSharedAccount({ path: { id: 'acc-9' }, throwOnError: true })),
    ).toBe(404);
    await removeSharedAccount({ path: { id: 'acc-1' }, throwOnError: true });
    expect(db.sharedAccounts.map((account) => account.id)).toEqual(['acc-2']);
  });
});
