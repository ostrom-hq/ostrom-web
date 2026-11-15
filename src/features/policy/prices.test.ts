// SPDX-License-Identifier: Apache-2.0
import type { ApiPrice } from '@gen/api/types.gen';
import {
  draftPrice,
  formatPrice,
  priceDraftOf,
  priceMicrosOf,
  sortPrices,
  utcDay,
  withoutPrice,
  withPrice,
} from './prices';

const row = (model: string, effectiveFrom: string, provider = 'anthropic'): ApiPrice => ({
  provider,
  model,
  effectiveFrom,
  inputMicros: 3_000_000,
  cacheWriteMicros: 3_750_000,
  cacheReadMicros: 300_000,
  outputMicros: 15_000_000,
});
const draft = {
  provider: 'anthropic',
  model: ' Claude-Sonnet-4 ',
  effectiveFrom: '2026-11-01',
  inputMicros: '3',
  cacheWriteMicros: '3.75',
  cacheReadMicros: '0,3',
  outputMicros: '15',
};

describe('the API price table', () => {
  it('reads prices in dollars a million tokens, to the micro-dollar', () => {
    expect(priceMicrosOf('0.30')).toBe(300_000);
    expect(priceMicrosOf('1000000')).toBe(1_000_000_000_000);
    expect(priceMicrosOf('1000001')).toBeUndefined();
    expect(priceMicrosOf('-1')).toBeUndefined();
    expect(formatPrice(300_000, 'en')).toBe('$0.30');
    expect(formatPrice(1_234_567, 'en')).toBe('$1.234567');
    expect(utcDay(new Date('2026-11-15T23:59:00Z'))).toBe('2026-11-15');
  });

  it('describes a row only with a provider, a model, a date and input and output above 0', () => {
    expect(draftPrice(draft)).toEqual({ ...row('claude-sonnet-4', '2026-11-01') });
    expect(draftPrice({ ...draft, cacheWriteMicros: '', cacheReadMicros: ' ' })).toMatchObject({
      cacheWriteMicros: 0,
      cacheReadMicros: 0,
    });
    expect(draftPrice({ ...draft, model: ' ' })).toBeUndefined();
    expect(draftPrice({ ...draft, model: 'x'.repeat(129) })).toBeUndefined();
    expect(draftPrice({ ...draft, provider: 'mistral' })).toBeUndefined();
    expect(draftPrice({ ...draft, effectiveFrom: '' })).toBeUndefined();
    expect(draftPrice({ ...draft, inputMicros: 'x' })).toBeUndefined();
    expect(draftPrice({ ...draft, outputMicros: '' })).toBeUndefined();
    expect(draftPrice({ ...draft, cacheWriteMicros: 'x' })).toBeUndefined();
    expect(draftPrice({ ...draft, cacheReadMicros: 'x' })).toBeUndefined();
    expect(draftPrice({ ...draft, inputMicros: '0' })).toBeUndefined();
    expect(draftPrice({ ...draft, outputMicros: '0' })).toBeUndefined();
  });

  it('replaces the row of the same model and date, and keeps the others', () => {
    const table = [row('claude-sonnet-4', '2026-10-21'), row('claude-opus-4', '2026-10-21')];
    const changed = { ...row('claude-sonnet-4', '2026-10-21'), outputMicros: 1 };
    expect(withPrice(table, changed)).toEqual([row('claude-opus-4', '2026-10-21'), changed]);
    expect(withoutPrice(table, row('claude-opus-4', '2026-10-21'))).toEqual([
      row('claude-sonnet-4', '2026-10-21'),
    ]);
  });

  it('fills the form with a row, which reads back as the same row', () => {
    const shown = row('claude-sonnet-4', '2026-10-21');
    expect(priceDraftOf(shown)).toMatchObject({ inputMicros: '3', cacheReadMicros: '0.3' });
    expect(draftPrice(priceDraftOf(shown))).toEqual(shown);
  });

  it('sorts by provider, model, then the latest date first', () => {
    const sorted = sortPrices([
      row('gpt-5', '2026-01-01', 'openai'),
      row('claude-sonnet-4', '2026-01-01'),
      row('claude-sonnet-4', '2026-06-01'),
      row('claude-opus-4', '2026-01-01'),
    ]);
    expect(sorted.map((item) => `${item.model}@${item.effectiveFrom}`)).toEqual([
      'claude-opus-4@2026-01-01',
      'claude-sonnet-4@2026-06-01',
      'claude-sonnet-4@2026-01-01',
      'gpt-5@2026-01-01',
    ]);
  });
});
