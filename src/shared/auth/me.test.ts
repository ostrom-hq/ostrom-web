// SPDX-License-Identifier: AGPL-3.0-only
import type { Me } from '@gen/api/types.gen';
import { meOf } from './me';

describe('meOf', () => {
  it('reads a body, and nothing from an empty answer', () => {
    const me: Me = { dev: { login: 'maya', verified: true, via: 'github' }, capabilities: [] };
    expect(meOf(me)).toBe(me);
    expect(meOf(undefined)).toBeUndefined();
  });
});
