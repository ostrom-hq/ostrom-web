import type { YesQueue } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import { failureOf, refusalOf, viewerLabel } from './useYes';

describe('failureOf', () => {
  it('passes errors through and wraps anything else', () => {
    const typed = new ApiFailure('server', 'HTTP 500', 500, undefined);
    const plain = new Error('boom');
    expect(failureOf(null)).toBeUndefined();
    expect(failureOf(undefined)).toBeUndefined();
    expect(failureOf(typed)).toBe(typed);
    expect(failureOf(plain)).toBe(plain);
    expect(failureOf('odd')?.message).toBe('odd');
  });
});

describe('refusalOf', () => {
  const body = { error: 'samir has to approve it', code: 'self_approval_refused', others: ['samir'] };

  it('reads the refusal of a 403 that matches the contract', () => {
    expect(refusalOf(new ApiFailure('forbidden', 'HTTP 403', 403, body))).toEqual(body);
  });

  it('ignores other failures and other 403 bodies', () => {
    expect(refusalOf(new Error('x'))).toBeUndefined();
    expect(refusalOf(new ApiFailure('server', 'HTTP 500', 500, body))).toBeUndefined();
    expect(refusalOf(new ApiFailure('forbidden', 'HTTP 403', 403, { error: 'no' }))).toBeUndefined();
  });
});

describe('viewerLabel', () => {
  const queue: YesQueue = { operator: 'ops', pending: [], recent: [] };

  it('names the approver account, or the console operator when the server knows no approver', () => {
    const label = (via: string, login: string): string => `${login}/${via}`;
    expect(viewerLabel(undefined, label)).toBeUndefined();
    expect(viewerLabel(queue, label)).toBe('ops');
    expect(viewerLabel({ ...queue, you: { login: 'maya', via: 'operator-account' } }, label)).toBe(
      'maya/operator-account',
    );
  });
});
