// SPDX-License-Identifier: AGPL-3.0-only
import { getAnalysisState, listRepos, restartAnalysis, startAnalysis } from '@gen/api/sdk.gen';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { setDemoRole } from '@/mocks/orgs';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';

const { server, db } = createMockServer();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function statusOf(call: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await call();
  } catch (error) {
    if (isApiFailure(error)) return error.status;
    throw error;
  }
  return 202;
}

const start = async (): Promise<number | undefined> =>
  statusOf(async () => startAnalysis({ throwOnError: true }));
const restart = async (): Promise<number | undefined> =>
  statusOf(async () => restartAnalysis({ throwOnError: true }));
const phase = async (): Promise<string | undefined> =>
  (await getAnalysisState({ throwOnError: true })).data.phase;

describe('mock GitHub', () => {
  it('lists no repository for an organization that gave none', async () => {
    db.repos = {};
    expect((await listRepos({ throwOnError: true })).data.items).toEqual([]);
  });

  it('runs an analysis phase by phase, once at a time, then proposes the rules', async () => {
    expect(await phase()).toBeUndefined();
    expect(await start()).toBe(202);
    expect(await start()).toBe(409);
    expect(await restart()).toBe(409);
    expect(await phase()).toBe('connect');
    expect(await phase()).toBe('read');
    expect(await phase()).toBe('propose');
    const done = (await getAnalysisState({ throwOnError: true })).data;
    expect(done.phase).toBe('ready');
    expect(done.rules).toEqual(db.rules);
    expect(await start()).toBe(202);
  });

  it('stops a run that fails, and restarts it', async () => {
    db.analyses[ACME] = { phase: 'propose', progress: 0.8, fails: true };
    db.repos = {};
    expect(await phase()).toBe('propose');
    const failed = (await getAnalysisState({ throwOnError: true })).data;
    expect(failed.failure?.['reason']).toBe('GitHub refused to list the code owners.');
    expect(failed.repos).toEqual([]);
    expect(await restart()).toBe(202);
    expect(db.analyses[ACME].fails).toBe(false);
  });

  it('analyses for owners and admins of an organization that installed the app only', async () => {
    setDemoRole(db, 'member');
    expect(await start()).toBe(403);
    db.orgMembers = {};
    expect(await start()).toBe(403);
    db.githubInstalled[ACME] = false;
    expect(await start()).toBe(409);
  });
});
