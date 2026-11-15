// SPDX-License-Identifier: Apache-2.0

/**
 * An XMLHttpRequest that sends through `globalThis.fetch`, for the tests: jsdom's own applies CORS to the mock
 * server's other origin, and would bypass the integration tests' handler fetch (its traffic and its end of test).
 * It reports the upload's progress at half and at the whole body, as a browser does along the way, then answers as
 * the fetch did. Only what `upload.ts` uses is here.
 */
export class FetchXhr extends EventTarget {
  /** The progress of the upload, as a browser's `xhr.upload`. */
  readonly upload = new EventTarget();
  withCredentials = false;
  status = 0;
  responseText = '';
  private method = 'GET';
  private url = '';
  private readonly headers = new Headers();
  private responseHeaders = '';
  private readonly controller = new AbortController();

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  getAllResponseHeaders(): string {
    return this.responseHeaders;
  }

  abort(): void {
    this.controller.abort();
  }

  send(body: ArrayBuffer): void {
    const progress = (loaded: number): void => {
      this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded, total: body.byteLength }));
    };
    const run = async (): Promise<void> => {
      progress(0);
      progress(Math.floor(body.byteLength / 2));
      progress(body.byteLength);
      try {
        const response = await globalThis.fetch(
          new Request(this.url, {
            method: this.method,
            headers: this.headers,
            body,
            credentials: this.withCredentials ? 'include' : 'same-origin',
            signal: this.controller.signal,
          }),
        );
        this.status = response.status;
        this.responseText = await response.text();
        // As a browser writes them: one line each, each ended by CRLF.
        this.responseHeaders = Array.from(response.headers, ([name, value]) => `${name}: ${value}\r\n`).join(
          '',
        );
        this.dispatchEvent(new Event('load'));
      } catch {
        this.dispatchEvent(new Event(this.controller.signal.aborted ? 'abort' : 'error'));
      }
    };
    void run();
  }
}
