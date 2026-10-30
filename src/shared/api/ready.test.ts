// SPDX-License-Identifier: AGPL-3.0-only
import { ready } from './ready';

describe('ready', () => {
  it('adds the tuning and keeps the generated options', () => {
    const interval = (): number => 5;
    const options = { queryKey: ['me'], queryFn: () => 1 };
    expect(ready(options, { staleTime: 60_000, refetchInterval: interval })).toEqual({
      ...options,
      staleTime: 60_000,
      refetchInterval: interval,
    });
    expect(ready(options)).toEqual(options);
    expect(options).not.toHaveProperty('staleTime');
  });

  it('refuses options without a query function, which the generator never writes', () => {
    expect(() => ready({ queryKey: ['me'] })).toThrow('a generated query always carries its query function');
  });
});
