import { z } from 'zod';
import { ApiFailure, isApiFailure, toApiFailure } from '@/shared/api/ApiFailure';

const response = (status: number): Response => new Response(null, { status });

describe('toApiFailure', () => {
  it('calls a request that fails its own validation an invalid request, not a network failure', () => {
    const zodError = z.string().min(1).safeParse('').error;
    expect(toApiFailure(zodError, undefined).kind).toBe('invalid-request');
  });

  it('calls any other error before a response unexpected', () => {
    expect(toApiFailure(new Error('interceptor bug'), undefined).kind).toBe('unexpected');
  });

  it('calls a fetch rejection a network failure', () => {
    const failure = toApiFailure(new TypeError('Failed to fetch'), undefined);
    expect(failure.kind).toBe('network');
    expect(failure.status).toBeUndefined();
  });

  it('calls a validation error on a 2xx an invalid response', () => {
    const zodError = z.string().safeParse(1).error;
    expect(toApiFailure(zodError, response(200)).kind).toBe('invalid-response');
  });

  it('calls a zod error on any status an invalid response', () => {
    const zodError = z.string().safeParse(1).error;
    expect(toApiFailure(zodError, response(500)).kind).toBe('invalid-response');
  });

  it.each([
    [400, 'bad-request'],
    [422, 'bad-request'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'server'],
    [503, 'server'],
    [409, 'unexpected'],
  ] as const)('maps HTTP %i to %s', (status, kind) => {
    expect(toApiFailure({ error: 'nope' }, response(status)).kind).toBe(kind);
  });

  it('keeps the server message and the raw body', () => {
    const body = { error: 'request not found' };
    const failure = toApiFailure(body, response(404));
    expect(failure.message).toBe('request not found');
    expect(failure.body).toBe(body);
    expect(failure.status).toBe(404);
  });

  it('falls back to the status when the body is not an error', () => {
    expect(toApiFailure('Bad Gateway', response(502)).message).toBe('HTTP 502');
  });

  it('returns an ApiFailure unchanged', () => {
    const failure = new ApiFailure('server', 'down', 500, undefined);
    expect(toApiFailure(failure, response(500))).toBe(failure);
  });
});

describe('isApiFailure', () => {
  it('narrows ApiFailure only', () => {
    expect(isApiFailure(new ApiFailure('network', 'x', undefined, undefined))).toBe(true);
    expect(isApiFailure(new Error('x'))).toBe(false);
  });
});
