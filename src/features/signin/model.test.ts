// SPDX-License-Identifier: AGPL-3.0-only
import { fragmentValue, looksLikeEmail, safeRedirect } from './model';

describe('safeRedirect', () => {
  it('keeps a path of this site', () => {
    expect(safeRedirect('/yes/apr-1?x=1')).toBe('/yes/apr-1?x=1');
  });

  it('goes home for anything else', () => {
    expect([
      safeRedirect(undefined),
      safeRedirect('https://evil.example'),
      safeRedirect('//evil.example'),
      safeRedirect('/\\evil.example'),
      safeRedirect('yes'),
    ]).toEqual(['/', '/', '/', '/', '/']);
  });
});

describe('fragmentValue', () => {
  it('reads a value from the fragment, with or without its #', () => {
    expect(fragmentValue('#token=ml_1&x=2', 'token')).toBe('ml_1');
    expect(fragmentValue('token=ml_1', 'token')).toBe('ml_1');
  });

  it('has none when it is absent or empty', () => {
    expect(fragmentValue('', 'token')).toBeUndefined();
    expect(fragmentValue('#token=', 'token')).toBeUndefined();
  });
});

describe('looksLikeEmail', () => {
  it('takes an address and refuses the rest', () => {
    expect([looksLikeEmail(' maya@acme.dev '), looksLikeEmail('maya'), looksLikeEmail('maya@acme')]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
