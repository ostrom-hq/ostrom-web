// SPDX-License-Identifier: AGPL-3.0-only
import { getResponse, RequestHandler } from 'msw';
import type { SetupServer } from 'msw/node';

/** What the integration tests watch of the console's calls, cleared after each test. */
export interface MockTraffic {
  /** Every request the console sends, before a handler answers it. */
  readonly onRequest: (listener: (request: Request) => void) => void;
  /** Every answer a handler gave, with its request. */
  readonly onResponse: (listener: (request: Request, response: Response) => void) => void;
  readonly clear: () => void;
}

export interface HandlerFetch {
  readonly fetch: typeof fetch;
  readonly traffic: MockTraffic;
}

/** Settles only when `signal` aborts, rejecting with its reason as given, as a real fetch does. */
async function aborted(signal: AbortSignal): Promise<never> {
  await new Promise<void>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
  signal.throwIfAborted();
  throw new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * A `fetch` that answers from the mock server's handlers directly, with no socket in between.
 *
 * MSW 3 intercepts Node's `fetch` at the socket. After a fetch is aborted (TanStack Query cancels its reads when a
 * screen unmounts), undici may open an idle connection that MSW passes through to the real network; the next
 * request written on it never reaches a handler and fails with `getaddrinfo ENOTFOUND` (mswjs/interceptors#862 and
 * #881, open on 0.45.11). A read survived it through its retry; a POST, sent once, was lost, and a test waited four
 * seconds for a change that never came. Answering here keeps every handler and `server.use()` override, and a call
 * no handler answers fails loudly instead of leaving for the network.
 *
 * What it does not do, as no handler here needs it: `passthrough()`, `bypass()`, storing `Set-Cookie`. An aborted
 * call is rejected at once, but its handler still runs to the end, as a server would. Remove it, and answer through
 * `server.listen()` again, once mswjs/interceptors#862 and #881 are fixed. A test of a pending state holds its
 * handler (`delay('infinite')`) rather than counting on how late an answer comes.
 */
export function createHandlerFetch(server: SetupServer): HandlerFetch {
  const requestListeners = new Set<(request: Request) => void>();
  const responseListeners = new Set<(request: Request, response: Response) => void>();
  const answer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // The client sends a ready Request: its copy is answered, so the one it keeps for its interceptors stays readable.
    const request = input instanceof Request && init === undefined ? input.clone() : new Request(input, init);
    const { signal } = request;
    signal.throwIfAborted();
    // The listeners of the test that sent the call: one left running when a test ends never reaches the next one's.
    const hearing = [...responseListeners];
    // Each listener with its own copy: none reads the body away from the handler.
    for (const listener of requestListeners) listener(request.clone());
    const handlers = server.listHandlers().filter((handler) => handler instanceof RequestHandler);
    const pending = getResponse(handlers, request).catch((error: unknown) => {
      // As MSW does: a handler that throws is a server error, not a failed network, and its stack is shown, unless
      // the caller gave up first and nobody reads the answer.
      if (!signal.aborted) console.error('Unhandled exception in a mock handler', error);
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ name: 'Unhandled exception in a mock handler', message }, { status: 500 });
    });
    // A handler that never answers (`delay('infinite')`) still lets the caller give up, as a real fetch does.
    const response = await Promise.race([pending, aborted(signal)]);
    if (response === undefined) {
      const missing = `no mock handler answers ${request.method} ${request.url}`;
      // Said in the test's output too: the console may show only a failure banner.
      console.error(missing);
      throw new Error(missing);
    }
    // `HttpResponse.error()`: the network failed, as fetch says it.
    if (response.type === 'error') throw new TypeError('Failed to fetch');
    for (const listener of hearing) listener(request, response);
    return response;
  };
  return {
    fetch: answer,
    traffic: {
      onRequest: (listener) => {
        requestListeners.add(listener);
      },
      onResponse: (listener) => {
        responseListeners.add(listener);
      },
      clear: () => {
        requestListeners.clear();
        responseListeners.clear();
      },
    },
  };
}
