// SPDX-License-Identifier: Apache-2.0
import {
  draftReconciliation,
  formatMicros,
  isEvidenceSource,
  oneLineOf,
  reconciledMicrosOf,
  usageReviewSearchSchema,
} from './model';

describe('the usage review', () => {
  it('reads its address, dropping what it does not know', () => {
    expect(usageReviewSearchSchema.parse({ member: ' m1 ', view: 'history' })).toEqual({
      member: 'm1',
      view: 'history',
    });
    expect(usageReviewSearchSchema.parse({ member: '', view: 'other' })).toEqual({});
  });

  it('reads a verified total in dollars, 0 included, to the micro-dollar', () => {
    expect(reconciledMicrosOf('0')).toBe(0);
    expect(reconciledMicrosOf(' 0,000123 ')).toBe(123);
    expect(reconciledMicrosOf('100000000')).toBe(100_000_000_000_000);
    expect(reconciledMicrosOf('100000001')).toBeUndefined();
    expect(reconciledMicrosOf('-1')).toBeUndefined();
    expect(reconciledMicrosOf('1.0000001')).toBeUndefined();
    expect(formatMicros(480_500, 'en')).toBe('$0.4805');
    expect(formatMicros(1_250_000, 'en')).toBe('$1.25');
  });

  it('takes one-line texts of 240 characters at most and the two evidence sources', () => {
    expect(oneLineOf(' ref ')).toBe('ref');
    expect(oneLineOf(' ')).toBeUndefined();
    expect(oneLineOf('a\nb')).toBeUndefined();
    expect(oneLineOf('x'.repeat(241))).toBeUndefined();
    expect(isEvidenceSource('PROVIDER_RECORD')).toBe(true);
    expect(isEvidenceSource('GUESS')).toBe(false);
  });

  it('sends the charge and request id shown with the correction, only when it is complete', () => {
    const draft = {
      expectedMicros: 1_250_000,
      expectedProviderRequestId: undefined,
      amount: '0.31',
      source: 'PROVIDER_RECORD',
      reference: 'export',
      reason: 'cut',
    };
    expect(draftReconciliation(draft)).toEqual({
      expectedMicros: 1_250_000,
      micros: 310_000,
      source: 'PROVIDER_RECORD',
      reference: 'export',
      reason: 'cut',
    });
    expect(draftReconciliation({ ...draft, expectedProviderRequestId: 'req_1' })).toMatchObject({
      expectedProviderRequestId: 'req_1',
    });
    expect(draftReconciliation({ ...draft, amount: '' })).toBeUndefined();
    expect(draftReconciliation({ ...draft, source: '' })).toBeUndefined();
    expect(draftReconciliation({ ...draft, reference: '' })).toBeUndefined();
    expect(draftReconciliation({ ...draft, reason: '' })).toBeUndefined();
  });
});
