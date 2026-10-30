// SPDX-License-Identifier: AGPL-3.0-only
import { ApiFailure } from '@/shared/api/ApiFailure';
import { isRefusal, pollUnlessRefused } from '@/shared/api/poll';

const failure = (kind: ConstructorParameters<typeof ApiFailure>[0], status: number | undefined): ApiFailure =>
  new ApiFailure(kind, 'x', status, undefined);

describe('pollUnlessRefused', () => {
  const poll = pollUnlessRefused(2_000);

  it('keeps polling with no error, a dropped connection or a server error', () => {
    expect(poll({ state: { error: null } })).toBe(2_000);
    expect(poll({ state: { error: failure('network', undefined) } })).toBe(2_000);
    expect(poll({ state: { error: failure('server', 503) } })).toBe(2_000);
    expect(poll({ state: { error: new Error('x') } })).toBe(2_000);
  });

  it('stops on a refusal', () => {
    expect(poll({ state: { error: failure('unauthorized', 401) } })).toBe(false);
    expect(poll({ state: { error: failure('not-found', 404) } })).toBe(false);
    expect(isRefusal(failure('server', 500))).toBe(false);
  });
});
