import { zApiError } from '@gen/api/zod.gen';
import { $ZodError } from 'zod/v4/core';

export type ApiFailureKind =
  | 'network'
  | 'invalid-request'
  | 'invalid-response'
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'server'
  | 'unexpected';

/** Every failed call of the generated client ends up as one of these: screens switch on `kind`, never on text. */
export class ApiFailure extends Error {
  override readonly name = 'ApiFailure';
  readonly kind: ApiFailureKind;
  readonly status: number | undefined;
  /** The parsed error body, still unknown: parse it with the contract's zod schema before using it. */
  readonly body: unknown;
  /** The server's stable snake_case key (`shown_digest_mismatch`, `self_approval_refused`…), when it sent one. */
  readonly code: string | undefined;

  constructor(
    kind: ApiFailureKind,
    message: string,
    status: number | undefined,
    body: unknown,
    code?: string,
  ) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

function kindOfStatus(status: number): ApiFailureKind {
  if (status === 400 || status === 422) return 'bad-request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'unexpected';
}

/** Maps what the generated client throws (error body, zod error, fetch failure) to an ApiFailure. */
export function toApiFailure(error: unknown, response: Response | undefined): ApiFailure {
  if (error instanceof ApiFailure) return error;
  if (response === undefined) {
    if (error instanceof $ZodError) {
      return new ApiFailure('invalid-request', 'The request does not match the contract.', undefined, error);
    }
    // fetch() rejects with a TypeError when the network fails; anything else is a bug before the call.
    if (error instanceof TypeError) {
      return new ApiFailure('network', 'The server could not be reached.', undefined, error);
    }
    return new ApiFailure('unexpected', 'The request failed before reaching the server.', undefined, error);
  }
  if (response.ok || error instanceof $ZodError) {
    return new ApiFailure(
      'invalid-response',
      'The server answered outside the contract.',
      response.status,
      error,
    );
  }
  const parsed = zApiError.safeParse(error);
  if (!parsed.success) {
    return new ApiFailure(
      kindOfStatus(response.status),
      `HTTP ${String(response.status)}`,
      response.status,
      error,
    );
  }
  const { type, message } = parsed.data.error;
  return new ApiFailure(kindOfStatus(response.status), message, response.status, error, type);
}

export function isApiFailure(error: unknown): error is ApiFailure {
  return error instanceof ApiFailure;
}
