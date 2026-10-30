// SPDX-License-Identifier: AGPL-3.0-only
import { ORG_OWNER_STORAGE_KEY, ORG_STORAGE_KEY, readStoredId, useOrgStore } from '@/shared/org/orgStore';

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
    useOrgStore.getState().only('org-acme');
    const state = useOrgStore.getState();
    expect([state.current, state.generation]).toEqual(['org-acme', before]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
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
    expect([state.current, state.owner, state.unknown]).toEqual([undefined, undefined, true]);
    expect(window.localStorage.getItem(ORG_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ORG_OWNER_STORAGE_KEY)).toBeNull();
    useOrgStore.getState().forget();
    expect(useOrgStore.getState().unknown).toBe(false);
  });
});
