// SPDX-License-Identifier: AGPL-3.0-only

/** Dollars as the reader's locale writes them, cents always shown: spend is read to the cent. */
export function formatUsd(usd: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usd);
}

/**
 * An amount in the currency's smallest unit (Stripe's cents, or yen for a currency without decimals), as the
 * reader's locale writes it.
 */
export function formatMinor(amount: number, currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amount / 10 ** digits);
}

/** Dollars typed in a field ("12", "12.5", "12,50"), or undefined when the field is empty or not a positive amount. */
export function parseUsd(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > 0 ? value : undefined;
}
