// SPDX-License-Identifier: AGPL-3.0-only
import { keyIdOf } from '@/shared/lib/signature';

describe('keyIdOf', () => {
  it('reads the key id of a signature, or nothing', () => {
    expect(keyIdOf('ed25519;kid=4f2a9c1b;sha256=0c;sig=ME')).toBe('4f2a9c1b');
    expect(keyIdOf('ed25519;sha256=0c')).toBeUndefined();
  });
});
