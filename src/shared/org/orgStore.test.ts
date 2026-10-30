// SPDX-License-Identifier: AGPL-3.0-only
import {
  followOtherTab,
  ORG_OWNER_STORAGE_KEY,
  ORG_STORAGE_KEY,
  readStoredId,
  useOrgStore,
} from '@/shared/org/orgStore';

function storageWith(value: string | null): { getItem: (key: string) => string | null } {
  return { getItem: (key) => (key === ORG_STORAGE_KEY ? value : null) };
}

afterEach(() => {
  useOrgStore.getState().forget();
});

describe('readStoredId', () => {
  it('keeps a stored id', () => {
    expect(readStoredId(storageWith('org-acme'), ORG_STORAGE_KEY)).toBe('org-acme');
  });

  it('reads nothing stored, or anything that could not go in a header, as nothing', () => {
    expect(readStoredId(storageWith(null), ORG_STORAGE_KEY)).toBeUndefined();
    expect(readStoredId(storageWith(''), ORG_STORAGE_KEY)).toBeUndefined();
    expect(readStoredId(storageWith('acme\r\nX-Evil: 1'), ORG_STORAGE_KEY)).toBeUndefined();
    expect(readStoredId(storageWith('a'.repeat(201)), ORG_STORAGE_KEY)).toBeUndefined();
  });
});

describe('useOrgStore', () => {
  it('acts in the only organization without keeping it or reading anything again', () => {
    const before = useOrgStore.getState().generation;
    useOrgStore.getState().open();
    useOrgStore.getState().only('org-acme');
    const state = useOrgStore.getState();
    expect([state.current, state.owner, state.generation, state.picking]).toEqual([
      'org-acme',
      undefined,
      before,
      false,
    ]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
  });

  it('keeps the picker open on the only organization left when the last choice is gone, until it is closed', () => {
    useOrgStore.getState().forget('unknown');
    useOrgStore.getState().only('org-acme');
    expect([useOrgStore.getState().picking, useOrgStore.getState().unknown]).toEqual([true, true]);
    useOrgStore.getState().close();
    expect([useOrgStore.getState().picking, useOrgStore.getState().unknown]).toEqual([false, false]);
  });

  it('keeps a choice with whose it is, and reads everything again only when it changes', () => {
    useOrgStore.getState().ask();
    const before = useOrgStore.getState().generation;
    useOrgStore.getState().choose('org-globex', 'maya');
    let state = useOrgStore.getState();
    expect([state.current, state.owner, state.picking, state.asked, state.generation]).toEqual([
      'org-globex',
      'maya',
      false,
      false,
      before + 1,
    ]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBe('org-globex');
    expect(window.localStorage.getItem(ORG_OWNER_STORAGE_KEY)).toBe('maya');
    useOrgStore.getState().choose('org-globex', 'maya');
    state = useOrgStore.getState();
    expect(state.generation).toBe(before + 1);
  });

  it('opens the picker when asked, unless the person closed it; the top bar still opens it', () => {
    useOrgStore.getState().ask();
    expect([useOrgStore.getState().asked, useOrgStore.getState().picking]).toEqual([true, true]);
    useOrgStore.getState().close();
    useOrgStore.getState().ask();
    expect(useOrgStore.getState().picking).toBe(false);
    useOrgStore.getState().open();
    useOrgStore.getState().ask();
    expect(useOrgStore.getState().picking).toBe(true);
  });

  it('forgets the choice, and says when it was no longer the person’s', () => {
    useOrgStore.getState().choose('org-acme', 'maya');
    useOrgStore.getState().forget('unknown');
    const state = useOrgStore.getState();
    expect([state.current, state.owner, state.unknown, state.picking]).toEqual([
      undefined,
      undefined,
      true,
      true,
    ]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ORG_OWNER_STORAGE_KEY)).toBeNull();
    useOrgStore.getState().forget();
    expect(useOrgStore.getState().unknown).toBe(false);
  });

  it('goes back to what is kept when someone signs in or out, without reading anything again itself', () => {
    useOrgStore.getState().choose('org-globex', 'maya');
    useOrgStore.getState().only('org-acme');
    useOrgStore.getState().ask();
    useOrgStore.getState().close();
    const before = useOrgStore.getState().generation;
    useOrgStore.getState().signedInOrOut();
    const state = useOrgStore.getState();
    expect([state.current, state.owner, state.asked, state.dismissed, state.generation]).toEqual([
      'org-globex',
      'maya',
      false,
      false,
      before,
    ]);
  });

  it('trusts no kept id without whose choice it is', () => {
    window.localStorage.setItem(ORG_STORAGE_KEY, 'org-globex');
    useOrgStore.getState().signedInOrOut();
    expect([useOrgStore.getState().current, useOrgStore.getState().owner]).toEqual([undefined, undefined]);
  });

  it('counts the doubts that send the list to be read again', () => {
    const before = useOrgStore.getState().doubts;
    useOrgStore.getState().doubt();
    expect(useOrgStore.getState().doubts).toBe(before + 1);
  });

  it('follows a choice made or dropped in another tab, and nothing else stored there', () => {
    const before = useOrgStore.getState().generation;
    window.localStorage.setItem(ORG_STORAGE_KEY, 'org-globex');
    window.localStorage.setItem(ORG_OWNER_STORAGE_KEY, 'maya');
    followOtherTab(new StorageEvent('storage', { key: 'ostrom.theme' }));
    expect(useOrgStore.getState().current).toBeUndefined();
    window.dispatchEvent(new StorageEvent('storage', { key: ORG_STORAGE_KEY }));
    expect([useOrgStore.getState().current, useOrgStore.getState().owner]).toEqual(['org-globex', 'maya']);
    expect(useOrgStore.getState().generation).toBe(before + 1);
    // The same again changes nothing.
    followOtherTab(new StorageEvent('storage', { key: ORG_OWNER_STORAGE_KEY }));
    expect(useOrgStore.getState().generation).toBe(before + 1);
    // Storage cleared in another tab.
    window.localStorage.clear();
    followOtherTab(new StorageEvent('storage', { key: null }));
    expect(useOrgStore.getState().current).toBeUndefined();
    expect(useOrgStore.getState().generation).toBe(before + 2);
  });
});
