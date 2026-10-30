// SPDX-License-Identifier: AGPL-3.0-only
import { tuned } from './tuned';

describe('tuned', () => {
  it('adds the tuning and keeps the generated options', () => {
    const interval = (): number => 5;
    const options = { queryKey: ['me'], queryFn: () => 1 };
    const result = tuned(options, { staleTime: 60_000, refetchInterval: interval });
    expect(result).toEqual({ ...options, staleTime: 60_000, refetchInterval: interval });
    expect(options).not.toHaveProperty('staleTime');
  });
});
