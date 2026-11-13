// SPDX-License-Identifier: Apache-2.0
import { useEmailLinkStore } from './emailLink';

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
