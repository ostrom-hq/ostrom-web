// SPDX-License-Identifier: Apache-2.0
import type { CloudFile } from '@gen/api/types.gen';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';
import { useOrgStore } from '@/shared/org/orgStore';
import { FetchXhr } from '@/test/fetchXhr';
import { FileRefused } from './files';
import { UPLOAD_ATTEMPTS, type UploadRequest, uploadFile, xhrFetch } from './upload';

const URL_PATTERN = '*/api/v1/cloud/sessions/:id/files';
const BYTES = new TextEncoder().encode('hello, files');
/** The SHA-256 of `hello, files`. */
let SHA = '';

const server = setupServer();

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
  const digest = await crypto.subtle.digest('SHA-256', BYTES);
  SHA = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllGlobals();
  useOrgStore.getState().forget();
});
afterAll(() => {
  server.close();
});

function stored(change: Partial<CloudFile> = {}): CloudFile {
  return {
    id: 'file-1',
    sessionId: 'cs-1',
    name: 'notes.txt',
    size: BYTES.length,
    contentType: 'text/plain',
    sha256: SHA.toUpperCase(),
    createdAt: '2026-11-15T10:00:00.000Z',
    expiresAt: '2026-11-16T10:00:00.000Z',
    ...change,
  };
}

function request(change: Partial<UploadRequest> = {}): UploadRequest {
  return {
    sessionId: 'cs-1',
    file: new Blob([BYTES]),
    name: 'notes.txt',
    contentType: 'text/plain',
    idempotencyKey: 'key-1',
    onProgress: () => undefined,
    signal: new AbortController().signal,
    ...change,
  };
}

const noWait = vi.fn(async () => {
  await Promise.resolve();
});

async function failureOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error('the upload did not fail');
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FetchXhr);
});

describe('an upload (TeamCode uploadCloudFile)', () => {
  beforeEach(() => {
    vi.stubGlobal('isSecureContext', true);
    noWait.mockClear();
  });

  it('sends the bytes under the name, the type and the key, through the client’s interceptors', async () => {
    useOrgStore.getState().choose('org-1', 'maya');
    document.cookie = 'ostrom_csrf=tok';
    const seen: { url: string; headers: Headers; body: string }[] = [];
    server.use(
      http.post(URL_PATTERN, async ({ request: sent }) => {
        seen.push({ url: sent.url, headers: sent.headers, body: await sent.text() });
        return HttpResponse.json(stored(), { status: 201 });
      }),
    );
    const progress: [number, number][] = [];
    const file = await uploadFile(
      request({
        onProgress: (sent, total) => {
          progress.push([sent, total]);
        },
      }),
    );
    expect(file).toEqual({ id: 'file-1', name: 'notes.txt', size: BYTES.length, contentType: 'text/plain' });
    const [call] = seen;
    expect(new URL(call?.url ?? '').searchParams.get('name')).toBe('notes.txt');
    expect(call?.headers.get('Idempotency-Key')).toBe('key-1');
    expect(call?.headers.get('Content-Type')).toBe('text/plain');
    expect(call?.headers.get('Ostrom-Org')).toBe('org-1');
    expect(call?.headers.get('X-CSRF-Token')).toBe('tok');
    expect(call?.body).toBe('hello, files');
    expect(progress).toEqual([
      [0, BYTES.length],
      [0, BYTES.length],
      [6, BYTES.length],
      [BYTES.length, BYTES.length],
    ]);
    document.cookie = 'ostrom_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('lets the server tell the type when nothing says', async () => {
    let type: string | null = null;
    server.use(
      http.post(URL_PATTERN, ({ request: sent }) => {
        type = sent.headers.get('Content-Type');
        return HttpResponse.json(stored(), { status: 200 });
      }),
    );
    await uploadFile(request({ contentType: undefined }));
    expect(type).toBe('application/octet-stream');
  });

  it('retries a network failure, 408, 5xx and a rate limit under the same key, waiting as the server says', async () => {
    const keys: (string | null)[] = [];
    const answers = [
      (): Response => HttpResponse.error(),
      (): Response =>
        HttpResponse.json(
          { error: { type: 'rate_limited', message: 'slow' } },
          {
            status: 429,
            headers: { 'Retry-After': '7' },
          },
        ),
      (): Response => HttpResponse.json({ error: { type: 'timeout', message: 't' } }, { status: 408 }),
      (): Response =>
        HttpResponse.json(
          { error: { type: 'down', message: 'd' } },
          {
            status: 503,
            headers: { 'Retry-After': '120' },
          },
        ),
      (): Response => HttpResponse.json(stored(), { status: 201 }),
    ];
    server.use(
      http.post(URL_PATTERN, ({ request: sent }) => {
        keys.push(sent.headers.get('Idempotency-Key'));
        const answer = answers.shift();
        if (answer === undefined) throw new Error('one attempt too many');
        return answer();
      }),
    );
    expect((await uploadFile(request(), noWait)).id).toBe('file-1');
    expect(keys).toEqual(Array.from({ length: UPLOAD_ATTEMPTS }, () => 'key-1'));
    // Backoff doubles; a Retry-After of 1 to 30 s replaces it, a longer one does not.
    expect(noWait.mock.calls.map((call: unknown[]) => call[0])).toEqual([1_000, 7_000, 4_000, 8_000]);
  });

  it('gives up after five attempts with the last refusal, and never retries a refusal of the file', async () => {
    server.use(
      http.post(URL_PATTERN, () =>
        HttpResponse.json({ error: { type: 'file_storage_unavailable', message: 'x' } }, { status: 503 }),
      ),
    );
    const error = await failureOf(uploadFile(request(), noWait));
    expect(error).toBeInstanceOf(FileRefused);
    expect(error).toMatchObject({ code: 'file_storage_unavailable', status: 503 });
    expect(noWait).toHaveBeenCalledTimes(UPLOAD_ATTEMPTS - 1);

    noWait.mockClear();
    server.use(
      http.post(URL_PATTERN, () =>
        HttpResponse.json(
          { error: { type: 'upload_quota', message: 'q' } },
          {
            status: 429,
            headers: { 'Retry-After': '3600' },
          },
        ),
      ),
    );
    expect(await failureOf(uploadFile(request(), noWait))).toMatchObject({
      code: 'upload_quota',
      status: 429,
      retryAfterSeconds: 3600,
    });
    expect(noWait).not.toHaveBeenCalled();
  });

  it('waits for an upload of the same key still running on the server, and sends nothing once stopped', async () => {
    let calls = 0;
    server.use(
      http.post(URL_PATTERN, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { type: 'file_upload_in_progress', message: 'later' } },
              { status: 409 },
            )
          : HttpResponse.json(stored(), { status: 200 });
      }),
    );
    expect((await uploadFile(request(), noWait)).id).toBe('file-1');
    expect(noWait).toHaveBeenCalledTimes(1);
    server.use(
      http.post(URL_PATTERN, () =>
        HttpResponse.json(
          { error: { type: 'file_storage_not_configured', message: 'off' } },
          { status: 409 },
        ),
      ),
    );
    expect(await failureOf(uploadFile(request(), noWait))).toMatchObject({
      code: 'file_storage_not_configured',
    });
    expect(noWait).toHaveBeenCalledTimes(1);
    calls = 0;
    const stopped = new AbortController();
    stopped.abort();
    await failureOf(uploadFile(request({ signal: stopped.signal }), noWait));
    expect(calls).toBe(0);
  });

  it('leaves the network, a sign-in and a missing session to the caller as any call', async () => {
    server.use(http.post(URL_PATTERN, () => HttpResponse.error()));
    const network = await failureOf(uploadFile(request(), noWait));
    expect(isApiFailure(network) && network.kind).toBe('network');
    server.use(
      http.post(URL_PATTERN, () =>
        HttpResponse.json({ error: { type: 'not_found', message: 'gone' } }, { status: 404 }),
      ),
    );
    expect(await failureOf(uploadFile(request(), noWait))).toMatchObject({ kind: 'not-found', status: 404 });
    server.use(
      http.post(URL_PATTERN, () =>
        HttpResponse.json({ error: { type: 'unauthorized', message: 'who' } }, { status: 401 }),
      ),
    );
    expect(await failureOf(uploadFile(request(), noWait))).toMatchObject({ kind: 'unauthorized' });
  });

  it('compares the stored size and SHA-256 with the bytes sent', async () => {
    server.use(http.post(URL_PATTERN, () => HttpResponse.json(stored({ sha256: 'ab' }), { status: 201 })));
    expect(await failureOf(uploadFile(request()))).toMatchObject({ code: 'file_integrity_failed' });
    server.use(http.post(URL_PATTERN, () => HttpResponse.json(stored({ size: 1 }), { status: 201 })));
    expect(await failureOf(uploadFile(request()))).toMatchObject({ code: 'file_integrity_failed' });
    // Without a secure context the browser has no digest: the size alone is compared.
    vi.stubGlobal('isSecureContext', false);
    server.use(http.post(URL_PATTERN, () => HttpResponse.json(stored({ sha256: 'ab' }), { status: 201 })));
    expect((await uploadFile(request())).id).toBe('file-1');
  });

  it('refuses a file it cannot read, or not at its size, without a request', async () => {
    const unreadable = new Blob([BYTES]);
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('gone'));
    expect(await failureOf(uploadFile(request({ file: unreadable })))).toMatchObject({
      code: 'file_unreadable',
    });
    const shrunk = new Blob([BYTES]);
    vi.spyOn(shrunk, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(2));
    expect(await failureOf(uploadFile(request({ file: shrunk })))).toMatchObject({ code: 'file_unreadable' });
  });

  it('stops when it is removed, sent or waiting', async () => {
    const controller = new AbortController();
    server.use(
      http.post(URL_PATTERN, () => {
        controller.abort();
        return HttpResponse.json({ error: { type: 'down', message: 'd' } }, { status: 503 });
      }),
    );
    await failureOf(uploadFile(request({ signal: controller.signal }), noWait));
    expect(noWait).not.toHaveBeenCalled();

    const waiting = new AbortController();
    server.use(
      http.post(URL_PATTERN, () =>
        HttpResponse.json({ error: { type: 'down', message: 'd' } }, { status: 503 }),
      ),
    );
    const call = uploadFile(request({ signal: waiting.signal }));
    // The real wait ends as soon as the upload is removed.
    setTimeout(() => {
      waiting.abort();
    }, 50);
    expect(await failureOf(call)).toBeDefined();
  });
});

describe('a failure that is not the server’s', () => {
  it('is never retried', async () => {
    // A request the browser stopped by itself: no answer, and not the network.
    class StoppedXhr extends FetchXhr {
      override send(): void {
        this.dispatchEvent(new Event('abort'));
      }
    }
    vi.stubGlobal('XMLHttpRequest', StoppedXhr);
    expect(await failureOf(uploadFile(request(), noWait))).toMatchObject({ kind: 'unexpected' });
    vi.stubGlobal('XMLHttpRequest', FetchXhr);
    const broken = new Error('the screen failed');
    const thrown = await failureOf(
      uploadFile(
        request({
          onProgress: () => {
            throw broken;
          },
        }),
        noWait,
      ),
    );
    expect(thrown).toBe(broken);
    expect(noWait).not.toHaveBeenCalled();
  });
});

describe('the XMLHttpRequest fetch', () => {
  it('takes an address as fetch does, and rejects a stopped request as an abort', async () => {
    server.use(
      http.post('http://ostrom.test/upload', () =>
        HttpResponse.text('ok', { headers: { 'Retry-After': 'soon', 'X-Two': 'a' } }),
      ),
    );
    const sent: number[] = [];
    const seen = { retryAfter: 5 as number | undefined };
    const response = await xhrFetch(
      new ArrayBuffer(3),
      (bytes) => sent.push(bytes),
      seen,
    )('http://ostrom.test/upload', { method: 'POST' });
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('X-Two')).toBe('a');
    expect(seen.retryAfter).toBeUndefined();

    server.use(http.post('http://ostrom.test/held', async () => new Promise<Response>(() => undefined)));
    const controller = new AbortController();
    const held = xhrFetch(
      new ArrayBuffer(3),
      () => undefined,
      seen,
    )('http://ostrom.test/held', {
      method: 'POST',
      signal: controller.signal,
    });
    controller.abort();
    expect(await failureOf(held)).toMatchObject({ name: 'AbortError' });
  });
});
