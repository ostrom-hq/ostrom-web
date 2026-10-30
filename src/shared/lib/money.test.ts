// SPDX-License-Identifier: AGPL-3.0-only
import { formatUsd, parseUsd } from './money';

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
