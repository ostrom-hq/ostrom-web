// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import { ARTIFACT_LIVE_MS, livePoll, refused } from './useArtifactViewer';

describe('the reading page’s poll', () => {
  it('asks every 10 seconds, and stops once the artifact cannot be read', () => {
    expect(livePoll({ state: { error: null } })).toBe(ARTIFACT_LIVE_MS);
    expect(livePoll({ state: { error: new ApiFailure('not-found', 'gone', 404, undefined) } })).toBe(false);
    expect(livePoll({ state: { error: new ApiFailure('forbidden', 'no', 403, undefined) } })).toBe(false);
    expect(livePoll({ state: { error: new ApiFailure('unauthorized', 'out', 401, undefined) } })).toBe(false);
  });

  it('goes on after a blip: a network error or a server error only skips a beat', () => {
    expect(livePoll({ state: { error: new ApiFailure('network', 'offline', undefined, undefined) } })).toBe(
      ARTIFACT_LIVE_MS,
    );
    expect(livePoll({ state: { error: new ApiFailure('server', 'oops', 503, undefined) } })).toBe(
      ARTIFACT_LIVE_MS,
    );
    expect(livePoll({ state: { error: new Error('aborted') } })).toBe(ARTIFACT_LIVE_MS);
    expect(refused(new Error('x'))).toBe(false);
  });
});
