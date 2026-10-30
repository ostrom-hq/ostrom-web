// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import '@/shared/lib/zodConfig';

describe('zod configuration', () => {
  it('never compiles parsers with eval, which the Content-Security-Policy forbids', () => {
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).parse({ a: 'b' })).toEqual({ a: 'b' });
  });
});
