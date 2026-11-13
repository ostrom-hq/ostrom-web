// SPDX-License-Identifier: Apache-2.0
import { useSetupLinkStore } from './setupLink';

describe('useSetupLinkStore', () => {
  it('holds the token until the server took it, and remembers it did', () => {
    useSetupLinkStore.getState().hold('osb_once');
    expect(useSetupLinkStore.getState()).toMatchObject({ token: 'osb_once', outcome: undefined });
    useSetupLinkStore.getState().grant();
    expect(useSetupLinkStore.getState()).toMatchObject({ token: undefined, outcome: 'granted' });
  });

  it('forgets a token the server found dead, and a new link starts afresh', () => {
    useSetupLinkStore.getState().hold('osb_old');
    useSetupLinkStore.getState().expire();
    expect(useSetupLinkStore.getState()).toMatchObject({ token: undefined, outcome: 'expired' });
    useSetupLinkStore.getState().hold('osb_new');
    expect(useSetupLinkStore.getState()).toMatchObject({ token: 'osb_new', outcome: undefined });
  });
});
