// SPDX-License-Identifier: Apache-2.0
import { CSRF_HEADER, csrfToken, withCsrf } from './csrf';

describe('csrfToken', () => {
  it('reads the token among other cookies, decoded', () => {
    expect(csrfToken('theme=dark; ostrom_csrf=a%2Bb=c; other=1')).toBe('a+b=c');
    expect(csrfToken('ostrom_csrf=a%E0%A4%A')).toBe('a%E0%A4%A');
  });

  it('reads the __Host- cookie of HTTPS first, the development one otherwise', () => {
    expect(csrfToken('ostrom_csrf=dev; __Host-ostrom_csrf=prod')).toBe('prod');
    expect(csrfToken('__Host-ostrom_csrf=; ostrom_csrf=dev')).toBe('dev');
  });

  it('has none without the cookie or with an empty one', () => {
    expect(csrfToken('')).toBeUndefined();
    expect(csrfToken('ostrom_csrf=')).toBeUndefined();
    expect(csrfToken('ostrom_csrf_old=x')).toBeUndefined();
  });
});

describe('withCsrf', () => {
  it('sends the token on a call that changes something', () => {
    const request = withCsrf(new Request('http://ostrom.test/x', { method: 'POST' }), 'ostrom_csrf=tok');
    expect(request.headers.get(CSRF_HEADER)).toBe('tok');
  });

  it('leaves reads alone, and any call without a token', () => {
    expect(withCsrf(new Request('http://ostrom.test/x'), 'ostrom_csrf=tok').headers.has(CSRF_HEADER)).toBe(
      false,
    );
    expect(
      withCsrf(new Request('http://ostrom.test/x', { method: 'DELETE' }), '').headers.has(CSRF_HEADER),
    ).toBe(false);
  });
});
