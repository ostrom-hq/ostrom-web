// SPDX-License-Identifier: AGPL-3.0-only
import { dropFragment } from './dropFragment';

describe('dropFragment', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('wipes the fragment from the address and its history entry, keeping the path and query', () => {
    window.history.replaceState({ kept: 1 }, '', '/yes?x=1#signin=opk_test_12345678');
    dropFragment();
    expect(window.location.href).not.toContain('opk_');
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/yes?x=1');
    expect(window.history.state).toEqual({ kept: 1 });
  });

  it('leaves an address without a fragment alone', () => {
    const replaceState = vi.fn();
    dropFragment({
      location: { hash: '', pathname: '/yes', search: '' },
      history: { state: null, replaceState },
    });
    expect(replaceState).not.toHaveBeenCalled();
  });
});
