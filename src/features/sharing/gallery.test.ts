// SPDX-License-Identifier: Apache-2.0
import type { Artifact } from '@gen/api/types.gen';
import {
  everyOrigin,
  formatBytes,
  isFiltered,
  onTab,
  originOf,
  queryOf,
  scopeOf,
  searchOf,
  shortId,
} from './gallery';
import { artifactsSearchSchema } from './route';

const artifact: Artifact = {
  id: 'a1',
  title: 'T',
  owner: 'maya',
  access: 'team',
  latestVersion: 1,
  url: 'https://app.test/artifacts/a1',
  createdAt: 't',
  updatedAt: 't',
};

describe('the gallery’s address', () => {
  it('reads the tab, the filters and the session or launch, and drops what it does not know', () => {
    expect(
      artifactsSearchSchema.parse({
        scope: 'shared',
        origin: 'cloud_session',
        access: 'link',
        session: 'abc-123',
        launch: 'run_1.2:3',
      }),
    ).toEqual({
      scope: 'shared',
      origin: 'cloud_session',
      access: 'link',
      session: 'abc-123',
      launch: 'run_1.2:3',
    });
    expect(
      artifactsSearchSchema.parse({
        scope: 'team',
        origin: 'web',
        access: 'public',
        session: 'a b',
        launch: '',
      }),
    ).toEqual({
      scope: undefined,
      origin: undefined,
      access: undefined,
      session: undefined,
      launch: undefined,
    });
    expect(artifactsSearchSchema.parse({ session: 'x'.repeat(65) }).session).toBeUndefined();
    expect(artifactsSearchSchema.parse({})).toEqual({
      scope: undefined,
      origin: undefined,
      access: undefined,
      session: undefined,
      launch: undefined,
    });
  });

  it('asks the server for the tab and the filters, the session as the contract’s cloudSession', () => {
    expect(queryOf({})).toEqual({});
    expect(
      queryOf({ scope: 'mine', origin: 'api', access: 'personal', session: 's1', launch: 'l1' }),
    ).toEqual({ scope: 'mine', origin: 'api', access: 'personal', cloudSession: 's1', launch: 'l1' });
  });

  it('says the tab, whether anything narrows the list, and moves to another tab', () => {
    expect(scopeOf({})).toBe('team');
    expect(scopeOf({ scope: 'shared' })).toBe('shared');
    expect(isFiltered({ scope: 'mine' })).toBe(false);
    expect(isFiltered({ origin: 'api' })).toBe(true);
    expect(isFiltered({ access: 'team' })).toBe(true);
    expect(isFiltered({ session: 's' })).toBe(true);
    expect(isFiltered({ launch: 'l' })).toBe(true);
    expect(onTab({ scope: 'mine', origin: 'api' }, 'team')).toEqual({ origin: 'api' });
    expect(onTab({ origin: 'api' }, 'shared')).toEqual({ origin: 'api', scope: 'shared' });
  });
});

describe('where an artifact came from', () => {
  it('is the API without a launch, a local run with one, a cloud session with one and a session', () => {
    expect(originOf(artifact)).toEqual({ kind: 'api' });
    expect(originOf({ ...artifact, origin: { launchId: 'l1' } })).toEqual({
      kind: 'local_run',
      launch: 'l1',
    });
    expect(originOf({ ...artifact, origin: { launchId: 'l1', cloudSessionId: 's1' } })).toEqual({
      kind: 'cloud_session',
      launch: 'l1',
      session: 's1',
    });
    expect(shortId('0123456789abcdef')).toBe('01234567');
  });
});

describe('a file’s size', () => {
  it('is in bytes under a kilobyte, then in units with one decimal', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(812, 'en')).toBe('812 B');
    expect(formatBytes(1024, 'en')).toBe('1 KB');
    expect(formatBytes(1_258_291, 'en')).toBe('1.2 MB');
    expect(formatBytes(5 * 1024 ** 3, 'en')).toBe('5 GB');
    expect(formatBytes(5 * 1024 ** 4, 'en')).toBe('5,120 GB');
    expect(formatBytes(1536, 'fr')).toBe('1,5 KB');
  });
});

describe('the address of a tab', () => {
  it('keeps only what is set, and goes back to every origin', () => {
    expect(searchOf({})).toEqual({});
    expect(searchOf({ scope: 'mine', origin: 'api', access: 'team', session: 's', launch: 'l' })).toEqual({
      scope: 'mine',
      origin: 'api',
      access: 'team',
      session: 's',
      launch: 'l',
    });
    expect(everyOrigin({ scope: 'shared', origin: 'api', session: 's', launch: 'l' })).toEqual({
      scope: 'shared',
      origin: 'api',
    });
  });
});
