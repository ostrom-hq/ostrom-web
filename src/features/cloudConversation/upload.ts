// SPDX-License-Identifier: Apache-2.0
import { client } from '@gen/api/client.gen';
import type { UploadCloudFileErrors, UploadCloudFileResponses } from '@gen/api/types.gen';
import { zCloudFileDto } from '@gen/api/zod.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import {
  FILE_INTEGRITY_FAILED,
  FILE_UNREADABLE,
  FileRefused,
  UPLOAD_IN_PROGRESS,
  UPLOAD_QUOTA,
  type UploadedFile,
} from './files';

/**
 * One file sent to a session (`POST /cloud/sessions/{id}/files`), as TeamCode's client `uploadCloudFile` sends it:
 * one `Idempotency-Key` across its attempts, retries of a network failure, `408`, `429` other than `upload_quota` and
 * `5xx` (five attempts in all, with backoff or the server's `Retry-After` up to 30 s), the progress of the bytes sent,
 * and the SHA-256 and size the server stored compared with the bytes sent (`file_integrity_failed` otherwise).
 *
 * The generated client's `fetch` cannot tell how far a body went: each attempt goes through the generated client (its
 * CSRF and `Ostrom-Org` interceptors, its failure mapping) with an XMLHttpRequest in place of `fetch`, whose upload
 * reports its progress.
 */

/** Attempts of one upload, the first included. */
export const UPLOAD_ATTEMPTS = 5;

const FIRST_WAIT_MS = 1_000;
const MAX_WAIT_MS = 15_000;
const MAX_RETRY_AFTER_SECONDS = 30;

export interface UploadRequest {
  readonly sessionId: string;
  readonly file: Blob;
  readonly name: string;
  /** A guess the server checks against the bytes; undefined to let it tell. */
  readonly contentType: string | undefined;
  readonly idempotencyKey: string;
  /** The bytes sent so far, from 0 at each attempt. */
  readonly onProgress: (sent: number, total: number) => void;
  readonly signal: AbortSignal;
}

/** Waits `ms`, or less when `signal` aborts. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

const sleepFor: Sleep = async (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** `Retry-After` in seconds, when the server sent a whole number. */
function retryAfterOf(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

/** What the response of an attempt said beyond its body: the generated client keeps no header of a failure. */
interface Seen {
  retryAfter: number | undefined;
}

/** The headers of an XMLHttpRequest answer, as a `Headers`. */
function headersOf(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

/**
 * A `fetch` for the generated client that sends `body` (the request's own is the same bytes) with an XMLHttpRequest,
 * reporting the bytes sent to `onProgress`. A network failure rejects as `fetch` does (a `TypeError`).
 */
export function xhrFetch(body: ArrayBuffer, onProgress: (sent: number) => void, seen: Seen): typeof fetch {
  return async (input, init) =>
    new Promise((resolve, reject) => {
      const request = input instanceof Request ? input : new Request(input, init);
      // Stopped before it left (removed while its bytes were read or it waited): nothing is sent.
      if (request.signal.aborted) {
        reject(new DOMException('The upload was stopped.', 'AbortError'));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open(request.method, request.url);
      request.headers.forEach((value, name) => {
        xhr.setRequestHeader(name, value);
      });
      xhr.withCredentials = request.credentials === 'include';
      xhr.upload.addEventListener('progress', (event) => {
        onProgress(event.loaded);
      });
      xhr.addEventListener('load', () => {
        const headers = headersOf(xhr.getAllResponseHeaders());
        seen.retryAfter = retryAfterOf(headers.get('Retry-After'));
        resolve(new Response(xhr.responseText, { status: xhr.status, headers }));
      });
      xhr.addEventListener('error', () => {
        reject(new TypeError('Failed to fetch'));
      });
      xhr.addEventListener('abort', () => {
        reject(new DOMException('The upload was stopped.', 'AbortError'));
      });
      request.signal.addEventListener('abort', () => {
        xhr.abort();
      });
      xhr.send(body);
    });
}

/** The hex SHA-256 of `bytes`; undefined where the browser offers no digest (a page served over plain HTTP). */
async function sha256Of(bytes: ArrayBuffer): Promise<string | undefined> {
  // `crypto.subtle` exists only in a secure context.
  if (!globalThis.isSecureContext) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The bytes of `file`, read once for every attempt: a file that cannot be read, or not at its size, is refused. */
async function bytesOf(file: Blob): Promise<ArrayBuffer> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new FileRefused(FILE_UNREADABLE, 0);
  }
  if (bytes.byteLength !== file.size) throw new FileRefused(FILE_UNREADABLE, 0);
  return bytes;
}

/** A file as stored, with the SHA-256 the server computed. */
interface Stored {
  readonly file: UploadedFile;
  readonly sha256: string;
}

async function attempt(request: UploadRequest, bytes: ArrayBuffer, seen: Seen): Promise<Stored> {
  const total = bytes.byteLength;
  request.onProgress(0, total);
  const { data } = await client.post<UploadCloudFileResponses, UploadCloudFileErrors, true>({
    url: '/api/v1/cloud/sessions/{id}/files',
    path: { id: request.sessionId },
    query: { name: request.name },
    headers: {
      'Content-Type': request.contentType ?? 'application/octet-stream',
      'Idempotency-Key': request.idempotencyKey,
    },
    body: bytes,
    bodySerializer: null,
    responseValidator: async (value: unknown) => zCloudFileDto.parseAsync(value),
    fetch: xhrFetch(
      bytes,
      (sent) => {
        request.onProgress(Math.min(sent, total), total);
      },
      seen,
    ),
    signal: request.signal,
    throwOnError: true,
  });
  return {
    file: { id: data.id, name: data.name, size: data.size, contentType: data.contentType },
    sha256: data.sha256.toLowerCase(),
  };
}

/**
 * The refusal of the file itself, with its code and `Retry-After`; the network, a sign-in and a missing session stay
 * the generated client's failure, as for any call.
 */
function refusedOf(error: unknown, seen: Seen): unknown {
  if (!isApiFailure(error) || error.status === undefined || error.status === 401 || error.status === 404)
    return error;
  return new FileRefused(error.code, error.status, seen.retryAfter);
}

/** A failure another attempt may cure: the network, a timeout, the server, a rate limit that is not the quota. */
function transient(error: unknown): boolean {
  if (!isApiFailure(error)) return false;
  if (error.kind === 'network') return true;
  const status = error.status ?? 0;
  return (
    status === 408 ||
    status >= 500 ||
    (status === 429 && error.code !== UPLOAD_QUOTA) ||
    // The first attempt under this key still runs on the server: a later one gets the file.
    (status === 409 && error.code === UPLOAD_IN_PROGRESS)
  );
}

/**
 * Uploads `request.file`, retrying what may pass under the same key. Throws `FileRefused` for a refusal of the file
 * (with the server's code and `Retry-After`), the generated client's `ApiFailure` for the network, a sign-in or a
 * missing session, as any call.
 */
export async function uploadFile(request: UploadRequest, sleep: Sleep = sleepFor): Promise<UploadedFile> {
  const bytes = await bytesOf(request.file);
  const expected = await sha256Of(bytes);
  let wait = FIRST_WAIT_MS;
  for (let count = 1; ; count += 1) {
    const seen: Seen = { retryAfter: undefined };
    try {
      const stored = await attempt(request, bytes, seen);
      if (stored.file.size !== bytes.byteLength || (expected !== undefined && stored.sha256 !== expected))
        throw new FileRefused(FILE_INTEGRITY_FAILED, 0);
      return stored.file;
    } catch (error) {
      if (request.signal.aborted || error instanceof FileRefused) throw error;
      if (!transient(error) || count >= UPLOAD_ATTEMPTS) throw refusedOf(error, seen);
      const after = seen.retryAfter;
      await sleep(
        after !== undefined && after >= 1 && after <= MAX_RETRY_AFTER_SECONDS ? after * 1_000 : wait,
        request.signal,
      );
      // Removed while it waited: nothing more is sent.
      request.signal.throwIfAborted();
    }
    wait = Math.min(wait * 2, MAX_WAIT_MS);
  }
}
