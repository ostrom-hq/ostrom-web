// SPDX-License-Identifier: Apache-2.0

/** Dollars as the reader's locale writes them, cents always shown: spend is read to the cent. */
export function formatUsd(usd: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usd);
}

/**
 * An amount in the currency's smallest unit (Stripe's cents, or yen for a currency without decimals), as the
 * reader's locale writes it.
 */
export function formatMinor(amount: number, currency: string, locale: string): string {
  let format: Intl.NumberFormat;
  try {
    format = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() });
  } catch {
    // A currency code the browser does not know: the amount in hundredths, with the code as the server wrote it.
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(amount / 100)} ${currency}`;
  }
  // The currency's minor digits, as the format writes them: two for dollars, none for yen.
  const digits = format.formatToParts(1).find((part) => part.type === 'fraction')?.value.length ?? 0;
  return format.format(amount / 10 ** digits);
}

/** Dollars typed in a field ("12", "12.5", "12,50"), or undefined when the field is empty or not a positive amount. */
export function parseUsd(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > 0 ? value : undefined;
}
