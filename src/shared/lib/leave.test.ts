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

  it('moves the real page', () => {
    exit.assign('#billing');
    expect(window.location.hash).toBe('#billing');
  });
});
