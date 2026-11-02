// SPDX-License-Identifier: AGPL-3.0-only
import { createSafeStorage } from '@/shared/lib/safeStorage';
import { EMAIL_ASKED_KEY, EMAIL_LINK_LIFETIME_MS, emailAsked, useEmailLinkStore } from './emailLink';

describe('emailAsked', () => {
  const storage = createSafeStorage(() => window.localStorage);
  afterEach(() => {
    window.localStorage.clear();
  });

  it('trusts a link asked for within its life, and keeps only a time', () => {
    emailAsked.mark(1_000, storage);
    expect(window.localStorage.getItem(EMAIL_ASKED_KEY)).toBe('1000');
    expect(emailAsked.recent(1_000 + EMAIL_LINK_LIFETIME_MS, storage)).toBe(true);
    expect(emailAsked.recent(1_001 + EMAIL_LINK_LIFETIME_MS, storage)).toBe(false);
  });

  it('trusts nothing never asked, written by hand, or from the future', () => {
    expect(emailAsked.recent(1_000, storage)).toBe(false);
    window.localStorage.setItem(EMAIL_ASKED_KEY, 'soon');
    expect(emailAsked.recent(1_000, storage)).toBe(false);
    emailAsked.mark(2_000, storage);
    expect(emailAsked.recent(1_000, storage)).toBe(false);
    emailAsked.clear(storage);
    expect(window.localStorage.getItem(EMAIL_ASKED_KEY)).toBeNull();
  });
});

describe('useEmailLinkStore', () => {
  it('hands the token to its use once, then nothing', () => {
    const used: string[] = [];
    useEmailLinkStore.getState().hold('ml_once');
    useEmailLinkStore.getState().spend((token) => used.push(token));
    useEmailLinkStore.getState().spend((token) => used.push(token));
    expect(used).toEqual(['ml_once']);
    expect(useEmailLinkStore.getState().token).toBeUndefined();
  });
});
