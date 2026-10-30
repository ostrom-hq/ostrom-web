// SPDX-License-Identifier: AGPL-3.0-only
import {
  followOtherTab,
  moveLegacyChoice,
  ORG_STORAGE_KEY,
  readStoredChoice,
  storedChoice,
  useOrgStore,
} from '@/shared/org/orgStore';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

function storageWith(value: string | null): { getItem: (key: string) => string | null } {
  return { getItem: (key) => (key === ORG_STORAGE_KEY ? value : null) };
}

afterEach(() => {
  useOrgStore.getState().forget();
});

describe('readStoredChoice', () => {
  it('keeps a stored choice with whose it is', () => {
    expect(readStoredChoice(storageWith(storedChoice({ id: 'org-acme', login: 'maya' })))).toEqual({
      id: 'org-acme',
      login: 'maya',
    });
  });

  it('reads nothing stored, an id alone, or anything that could not go in a header, as nothing', () => {
    expect(readStoredChoice(storageWith(null))).toBeUndefined();
    expect(readStoredChoice(storageWith(''))).toBeUndefined();
    expect(readStoredChoice(storageWith('org-acme'))).toBeUndefined();
    expect(readStoredChoice(storageWith(JSON.stringify({ id: 'org-acme' })))).toBeUndefined();
    expect(
      readStoredChoice(storageWith(storedChoice({ id: 'acme\r\nX-Evil: 1', login: 'maya' }))),
    ).toBeUndefined();
    expect(
      readStoredChoice(storageWith(storedChoice({ id: 'a'.repeat(201), login: 'maya' }))),
    ).toBeUndefined();
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
    expect(readStoredChoice(window.localStorage)).toEqual({ id: 'org-globex', login: 'maya' });
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
    useOrgStore.getState().choose('org-acme', 'maya');
    useOrgStore.getState().close();
    const before = useOrgStore.getState().generation;
    const event = (key: string | null): StorageEvent =>
      new StorageEvent('storage', { key, storageArea: window.localStorage });
    window.localStorage.setItem(ORG_STORAGE_KEY, storedChoice({ id: 'org-globex', login: 'maya' }));
    followOtherTab(event('ostrom.theme'));
    expect(useOrgStore.getState().current).toBe('org-acme');
    followOtherTab(event(ORG_STORAGE_KEY));
    const state = useOrgStore.getState();
    expect([state.current, state.owner, state.dismissed, state.generation]).toEqual([
      'org-globex',
      'maya',
      false,
      before + 1,
    ]);
    // The same again changes nothing; nor does a key of the same name in session storage.
    followOtherTab(event(ORG_STORAGE_KEY));
    window.localStorage.setItem(ORG_STORAGE_KEY, storedChoice({ id: 'org-other', login: 'maya' }));
    followOtherTab(new StorageEvent('storage', { key: ORG_STORAGE_KEY, storageArea: window.sessionStorage }));
    expect([useOrgStore.getState().current, useOrgStore.getState().generation]).toEqual([
      'org-globex',
      before + 1,
    ]);
    // Dropped in another tab (storage cleared).
    window.localStorage.clear();
    followOtherTab(event(null));
    expect(useOrgStore.getState().current).toBeUndefined();
    expect(useOrgStore.getState().generation).toBe(before + 2);
  });

  it('keeps the only organization of this tab when nothing is chosen anywhere', () => {
    useOrgStore.getState().only('org-acme');
    const before = useOrgStore.getState().generation;
    followOtherTab(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));
    expect([useOrgStore.getState().current, useOrgStore.getState().generation]).toEqual(['org-acme', before]);
  });

  it('takes the same organization chosen in another tab as chosen, without reading anything again', () => {
    useOrgStore.getState().only('org-acme');
    useOrgStore.getState().open();
    const before = useOrgStore.getState().generation;
    window.localStorage.setItem(ORG_STORAGE_KEY, storedChoice({ id: 'org-acme', login: 'maya' }));
    followOtherTab(new StorageEvent('storage', { key: ORG_STORAGE_KEY, storageArea: window.localStorage }));
    const state = useOrgStore.getState();
    expect([state.current, state.owner, state.generation, state.picking]).toEqual([
      'org-acme',
      'maya',
      before,
      true,
    ]);
  });

  it('moves a choice kept under the two old keys to the one key, once', () => {
    window.localStorage.setItem('ostrom.org', 'org-globex');
    window.localStorage.setItem('ostrom.org.login', 'maya');
    moveLegacyChoice(safeLocalStorage);
    expect(readStoredChoice(window.localStorage)).toEqual({ id: 'org-globex', login: 'maya' });
    expect([
      window.localStorage.getItem('ostrom.org'),
      window.localStorage.getItem('ostrom.org.login'),
    ]).toEqual([null, null]);
    // A newer choice wins; half an old pair is only erased.
    window.localStorage.setItem('ostrom.org', 'org-acme');
    window.localStorage.setItem('ostrom.org.login', 'maya');
    moveLegacyChoice(safeLocalStorage);
    expect(readStoredChoice(window.localStorage)?.id).toBe('org-globex');
    window.localStorage.clear();
    window.localStorage.setItem('ostrom.org', 'org-acme');
    moveLegacyChoice(safeLocalStorage);
    expect(window.localStorage.length).toBe(0);
  });
});
