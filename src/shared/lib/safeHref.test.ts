// SPDX-License-Identifier: Apache-2.0
import { safeHref } from '@/shared/lib/safeHref';

describe('safeHref', () => {
  it('keeps http and https links', () => {
    expect(safeHref('https://github.com/acme/x/pull/1')).toBe('https://github.com/acme/x/pull/1');
    expect(safeHref('http://ci.local/run/2')).toBe('http://ci.local/run/2');
  });

  it('drops anything else, and what is not a URL', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,hi')).toBeUndefined();
    expect(safeHref('not a url')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
