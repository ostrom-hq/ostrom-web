// SPDX-License-Identifier: Apache-2.0
import { ARTIFACT_LIVE_MS, livePoll } from './useArtifactViewer';

describe('the reading page’s poll', () => {
  it('asks every 10 seconds, and stops once the artifact cannot be read', () => {
    expect(livePoll({ state: { error: null } })).toBe(ARTIFACT_LIVE_MS);
    expect(livePoll({ state: { error: new Error('gone') } })).toBe(false);
  });
});
