// SPDX-License-Identifier: Apache-2.0
import { formatMinor, formatUsd, parseUsd } from './money';

describe('formatMinor', () => {
  it('reads Stripe amounts in the smallest unit of their currency', () => {
    expect(formatMinor(1500, 'usd', 'en')).toBe('$15.00');
    expect(formatMinor(14_400, 'eur', 'fr')).toMatch(/^144,00\s€$/);
    expect(formatMinor(1500, 'jpy', 'en')).toBe('¥1,500');
  });

  it('writes the code as it came for a currency the browser does not know', () => {
    expect(formatMinor(1500, 'not a code', 'en')).toBe('15.00 not a code');
  });
});

describe('formatUsd', () => {
  it('writes dollars to the cent in the reader’s locale', () => {
    expect(formatUsd(1119.3, 'en')).toBe('$1,119.30');
    expect(formatUsd(1119.3, 'fr')).toMatch(/^1\s119,30\s\$US$/);
  });
});

describe('parseUsd', () => {
  it('reads a positive amount with a dot or a comma', () => {
    expect([parseUsd(' 12 '), parseUsd('12.5'), parseUsd('12,50')]).toEqual([12, 12.5, 12.5]);
  });
  it('refuses empty, zero, negative, too precise or not a number', () => {
    expect([parseUsd(''), parseUsd('0'), parseUsd('-3'), parseUsd('1.234'), parseUsd('ten')]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
