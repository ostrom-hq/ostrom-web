// SPDX-License-Identifier: AGPL-3.0-only
import { useSetupLinkStore } from './setupLink';

describe('useSetupLinkStore', () => {
  it('holds the token until it is dropped', () => {
    useSetupLinkStore.getState().hold('osb_once');
    expect(useSetupLinkStore.getState().token).toBe('osb_once');
    useSetupLinkStore.getState().drop();
    expect(useSetupLinkStore.getState().token).toBeUndefined();
  });
});
