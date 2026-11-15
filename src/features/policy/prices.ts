// SPDX-License-Identifier: Apache-2.0
import type { ApiPrice } from '@gen/api/types.gen';

/**
 * TeamCode's API price table (`capacity.apiprices.v1`): what the provider's pay-as-you-go API charges per million
 * tokens, for a model (or a family prefix) from a date on. Prices are micro-dollars per million tokens.
 */
const MICROS = 1_000_000;
/** The largest price the server takes: $1 000 000 a million tokens. */
export const MAX_PRICE_MICROS = 1_000_000_000_000;
/** At most 200 rows. */
export const MAX_PRICE_ROWS = 200;
export const PRICE_PROVIDERS = ['anthropic', 'openai'] as const;
export const MAX_MODEL_LENGTH = 128;

export const PRICE_KINDS = ['inputMicros', 'cacheWriteMicros', 'cacheReadMicros', 'outputMicros'] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

/** A price for the reader, in dollars a million tokens, to the micro-dollar when it has them. */
export function formatPrice(micros: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(micros / MICROS);
}

/** Dollars a million tokens typed ("3", "0.30", "0,3"), as micro-dollars; undefined when it is not a price. */
export function priceMicrosOf(draft: string): number | undefined {
  const text = draft.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return undefined;
  const micros = Math.round(Number(text) * MICROS);
  return micros <= MAX_PRICE_MICROS ? micros : undefined;
}

/** Today's date in UTC, `YYYY-MM-DD`: the default date a new row applies from. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface PriceDraft {
  readonly provider: string;
  readonly model: string;
  readonly effectiveFrom: string;
  readonly inputMicros: string;
  readonly cacheWriteMicros: string;
  readonly cacheReadMicros: string;
  readonly outputMicros: string;
}

/**
 * The row the form describes, or undefined while it does not describe one: a known provider, a lowercase model or
 * prefix, a date, four prices with input and output above 0 (a cache price left empty is 0).
 */
export function draftPrice(draft: PriceDraft): ApiPrice | undefined {
  const model = draft.model.trim().toLowerCase();
  if (model === '' || model.length > MAX_MODEL_LENGTH) return undefined;
  if (!PRICE_PROVIDERS.some((provider) => provider === draft.provider)) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom)) return undefined;
  const input = priceMicrosOf(draft.inputMicros);
  const output = priceMicrosOf(draft.outputMicros);
  const cacheWrite = draft.cacheWriteMicros.trim() === '' ? 0 : priceMicrosOf(draft.cacheWriteMicros);
  const cacheRead = draft.cacheReadMicros.trim() === '' ? 0 : priceMicrosOf(draft.cacheReadMicros);
  if (input === undefined || output === undefined || cacheWrite === undefined || cacheRead === undefined)
    return undefined;
  if (input === 0 || output === 0) return undefined;
  return {
    provider: draft.provider,
    model,
    effectiveFrom: draft.effectiveFrom,
    inputMicros: input,
    cacheWriteMicros: cacheWrite,
    cacheReadMicros: cacheRead,
    outputMicros: output,
  };
}

function sameRow(a: ApiPrice, b: ApiPrice): boolean {
  return a.provider === b.provider && a.model === b.model && a.effectiveFrom === b.effectiveFrom;
}

/**
 * The table to send once `row` is added: it replaces the row of the same provider, model and date. While the built-in
 * prices apply (`defaults`), they are not the organization's rows: the table sent holds the new row alone.
 */
export function withPrice(prices: readonly ApiPrice[], defaults: boolean, row: ApiPrice): ApiPrice[] {
  const kept = defaults ? [] : prices.filter((item) => !sameRow(item, row));
  return sortPrices([...kept, row]);
}

/** The table to send without `row`. */
export function withoutPrice(prices: readonly ApiPrice[], row: ApiPrice): ApiPrice[] {
  return prices.filter((item) => !sameRow(item, row));
}

/** By provider, then model, then the latest date first: a model's rows read from the one in force back. */
export function sortPrices(prices: readonly ApiPrice[]): ApiPrice[] {
  return [...prices].sort((a, b) => {
    const byProvider = a.provider.localeCompare(b.provider);
    if (byProvider !== 0) return byProvider;
    const byModel = a.model.localeCompare(b.model);
    return byModel !== 0 ? byModel : b.effectiveFrom.localeCompare(a.effectiveFrom);
  });
}
