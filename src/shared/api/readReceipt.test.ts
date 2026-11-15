// SPDX-License-Identifier: Apache-2.0
import { readReceipt } from './readReceipt';

describe('readReceipt', () => {
  it('reads a receipt and nothing else', () => {
    const receipt = {
      id: 'rcpt-1',
      subject: { kind: 'gate', id: 'apr-1', digest: 'sha256:x' },
      initiator: 'theo',
      rules: [],
      decisions: [],
      createdAt: '2026-10-30T08:00:00.000Z',
      signature: 'ed25519;sig=x',
    };
    expect(readReceipt(receipt)?.id).toBe('rcpt-1');
    expect(readReceipt({ id: 'rcpt-1' })).toBeUndefined();
    expect(readReceipt(null)).toBeUndefined();
  });
});
