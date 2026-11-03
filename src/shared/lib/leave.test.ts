// SPDX-License-Identifier: AGPL-3.0-only
import { exit, leaveFor } from './leave';

describe('leaveFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves for an https page', () => {
    const assign = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    expect(leaveFor('https://checkout.stripe.com/c/pay/cs_test')).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test');
  });

  it('stays for anything else', () => {
    const assign = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    expect([
      leaveFor('http://checkout.stripe.com'),
      leaveFor('javascript:alert(1)'),
      leaveFor('not a url'),
    ]).toEqual([false, false, false]);
    expect(assign).not.toHaveBeenCalled();
  });

  it('leaves for a page on the machine itself only when allowed', () => {
    const assign = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    expect(leaveFor('http://127.0.0.1:4610/login/oauth/authorize')).toBe(false);
    expect([
      leaveFor('http://127.0.0.1:4610/login/oauth/authorize', { loopback: true }),
      leaveFor('http://localhost:4610/login/oauth/authorize', { loopback: true }),
      leaveFor('http://[::1]:4610/login/oauth/authorize', { loopback: true }),
      leaveFor('https://github.com/login/oauth/authorize', { loopback: true }),
    ]).toEqual([true, true, true, true]);
    expect([
      leaveFor('http://github.com/login/oauth/authorize', { loopback: true }),
      leaveFor('ftp://127.0.0.1/x', { loopback: true }),
    ]).toEqual([false, false]);
    expect(assign).toHaveBeenCalledTimes(4);
  });

  it('moves the real page', () => {
    exit.assign('#billing');
    expect(window.location.hash).toBe('#billing');
  });
});
