// SPDX-License-Identifier: AGPL-3.0-only
import { ORG_STORAGE_KEY, readOrgId, useOrgStore } from '@/shared/org/orgStore';

const acme = { id: 'org-acme', name: 'Acme', avatarUrl: '' };
const globex = { id: 'org-globex', name: 'Globex', avatarUrl: '' };
/** An organization as `/me` names it: only what the picker shows is kept. */
const globexInFull = { ...globex, description: 'Imports and exports' };

function storageWith(value: string | null): { getItem: (key: string) => string | null } {
  return { getItem: (key) => (key === ORG_STORAGE_KEY ? value : null) };
}

afterEach(() => {
  useOrgStore.getState().forget();
});

describe('readOrgId', () => {
  it('keeps a stored id', () => {
    expect(readOrgId(storageWith('org-acme'))).toBe('org-acme');
  });

  it('reads nothing stored, or anything that could not go in a header, as no organization', () => {
    expect(readOrgId(storageWith(null))).toBeUndefined();
    expect(readOrgId(storageWith(''))).toBeUndefined();
    expect(readOrgId(storageWith('acme\r\nX-Evil: 1'))).toBeUndefined();
    expect(readOrgId(storageWith('a'.repeat(201)))).toBeUndefined();
  });
});

describe('useOrgStore', () => {
  it('acts in the organization the server named when none was chosen, and remembers each one once', () => {
    const before = useOrgStore.getState().generation;
    useOrgStore.getState().adopt(acme);
    useOrgStore.getState().adopt(acme);
    useOrgStore.getState().adopt(globexInFull);
    const state = useOrgStore.getState();
    expect(state.current).toBe('org-acme');
    expect(state.seen).toEqual([acme, globex]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBe('org-acme');
    // What was read before was read in that same organization: nothing to throw away.
    expect(state.generation).toBe(before);
  });

  it('keeps a choice, closes the picker and says what was read is stale', () => {
    useOrgStore.getState().open();
    const before = useOrgStore.getState().generation;
    expect(useOrgStore.getState().choose(' org-globex ')).toBe(true);
    const state = useOrgStore.getState();
    expect([state.current, state.picking, state.generation]).toEqual(['org-globex', false, before + 1]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBe('org-globex');
  });

  it('refuses a choice that is not an id, and changes nothing', () => {
    useOrgStore.getState().open();
    expect(useOrgStore.getState().choose('   ')).toBe(false);
    expect(useOrgStore.getState().choose('two words')).toBe(false);
    expect([useOrgStore.getState().current, useOrgStore.getState().picking]).toEqual([undefined, true]);
  });

  it('opens and closes the picker', () => {
    useOrgStore.getState().open();
    expect(useOrgStore.getState().picking).toBe(true);
    useOrgStore.getState().close();
    expect(useOrgStore.getState().picking).toBe(false);
  });

  it('forgets the choice and what it saw', () => {
    useOrgStore.getState().adopt(acme);
    useOrgStore.getState().forget();
    expect([useOrgStore.getState().current, useOrgStore.getState().seen]).toEqual([undefined, []]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
  });
});
