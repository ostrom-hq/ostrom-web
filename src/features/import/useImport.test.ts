// SPDX-License-Identifier: AGPL-3.0-only
import { ApiFailure } from '@/shared/api/ApiFailure';
import { failureFrom } from './useImport';

describe('what a failed import says', () => {
  it('says a cutover failure the client did not shape as one that may have run', () => {
    expect(failureFrom('cutover', new Error('boom'))).toEqual({ kind: 'cutoverUnknown', message: 'boom' });
    expect(failureFrom('cutover', undefined)).toBeUndefined();
  });

  it('knows the server’s refusals by status, type and words, never by the type alone', () => {
    const refused = (status: number, code: string, message: string) =>
      failureFrom('cutover', new ApiFailure('forbidden', message, status, undefined, code));
    expect(refused(403, 'forbidden', 'Only an owner of the organization runs the cutover import.')).toEqual({
      kind: 'ownersOnly',
    });
    // Another refusal (4xx) wrote nothing either, but says only its own words.
    expect(refused(403, 'forbidden', 'This credential belongs to no organization.')).toEqual({
      kind: 'other',
      message: 'This credential belongs to no organization.',
    });
    // The right words on a server failure are not the refusal: it may come after a write.
    expect(refused(503, 'forbidden', 'Only an owner of the organization runs the cutover import.')).toEqual({
      kind: 'cutoverUnknown',
      message: 'Only an owner of the organization runs the cutover import.',
    });
    // A request the client never sent ran nothing; a dropped connection may have.
    expect(
      failureFrom('cutover', new ApiFailure('invalid-request', 'not the contract', undefined, undefined)),
    ).toEqual({ kind: 'other', message: 'not the contract' });
    expect(
      failureFrom(
        'cutover',
        new ApiFailure('network', 'The server could not be reached.', undefined, undefined),
      ),
    ).toEqual({ kind: 'cutoverUnknown', message: 'The server could not be reached.' });
    expect(failureFrom('import', new Error('x'))).toEqual({ kind: 'other', message: 'x' });
  });
});
