// SPDX-License-Identifier: AGPL-3.0-only
import { AsyncLocalStorage } from 'node:async_hooks';
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
  /**
   * The end of a test, as a closed page: every call still waiting for its answer is called off and stays unanswered
   * (no answer, no rejection, so no callback of the console runs any more), then each handler still running is
   * awaited until it answers or reaches a hold (`delay('infinite')`, `held()`), so none writes into the mock database
   * once it is reset for the next test. Fails the test when a handler is still running 2 s after it.
   */
  readonly endTest: () => Promise<void>;
}

/** One handler on its way: `hold` is called when it reaches `held()` (or `delay('infinite')`). */
interface HandlerRun {
  readonly hold: () => void;
}

/** The handler a piece of code runs for, through every await and timer of that handler. */
export const handlerRuns = new AsyncLocalStorage<HandlerRun>();

/**
 * Holds the handler that awaits it until `until` settles, and says so: the end of a test stops waiting for it. For a
 * test of a pending state released later in the file, where `delay('infinite')` could not be released. Once released
 * after its test ended, the handler is no longer waited for: it should then answer and write nothing more.
 */
export async function held<T>(until: Promise<T>): Promise<T> {
  handlerRuns.getStore()?.hold();
  const value = await until;
  return value;
}

/** How long the end of a test waits for the handlers on a finite wait: well beyond the longest `delay()` of a test. */
const SETTLE_LIMIT_MS = 2_000;

/** A call of a closed page: it never settles, so nothing waits on its answer or its failure any more. */
async function unanswered(): Promise<never> {
  await new Promise<never>(() => undefined);
  throw new Error('unreachable');
}

/** The reason a call is called off at the end of its test: it then stays unanswered, as on a closed page. */
const TEST_ENDED = new DOMException('The test ended.', 'AbortError');

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
 * handler (`delay('infinite')`, `held()`) rather than counting on how late an answer comes. A call still waiting when
 * its test ends is called off by `endTest()`.
 */
export function createHandlerFetch(server: SetupServer): HandlerFetch {
  const inFlight = new Set<AbortController>();
  // Each handler still running, with what the end of a test waits for: its end, or its reaching a hold.
  const running = new Map<Promise<unknown>, Promise<void>>();
  const requestListeners = new Set<(request: Request) => void>();
  const responseListeners = new Set<(request: Request, response: Response) => void>();
  const answer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // The client sends a ready Request: its copy is answered, so the one it keeps for its interceptors stays readable.
    const request = input instanceof Request && init === undefined ? input.clone() : new Request(input, init);
    request.signal.throwIfAborted();
    // Called off by the caller, or by the end of the test (`endTest`).
    const call = new AbortController();
    const { signal } = call;
    const callerGaveUp = (): void => {
      call.abort(request.signal.reason);
    };
    request.signal.addEventListener('abort', callerGaveUp, { once: true });
    inFlight.add(call);
    // The listeners of the test that sent the call: one left running when a test ends never reaches the next one's.
    const hearing = [...responseListeners];
    // Each listener with its own copy: none reads the body away from the handler.
    for (const listener of requestListeners) listener(request.clone());
    const handlers = server.listHandlers().filter((handler) => handler instanceof RequestHandler);
    let hold: () => void = () => undefined;
    const reachedHold = new Promise<void>((resolve) => {
      hold = resolve;
    });
    const handled = handlerRuns.run({ hold }, async () => getResponse(handlers, request));
    const ended = handled.then(
      () => undefined,
      () => undefined,
    );
    running.set(handled, Promise.race([ended, reachedHold]));
    void handled.then(
      () => running.delete(handled),
      () => running.delete(handled),
    );
    const pending = handled.catch((error: unknown) => {
      // As MSW does: a handler that throws is a server error, not a failed network, and its stack is shown, unless
      // the caller gave up first and nobody reads the answer.
      if (!signal.aborted) console.error('Unhandled exception in a mock handler', error);
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ name: 'Unhandled exception in a mock handler', message }, { status: 500 });
    });
    // A handler that never answers (`delay('infinite')`) still lets the caller give up, as a real fetch does.
    let response: Response | undefined;
    try {
      response = await Promise.race([pending, aborted(signal)]);
    } catch (error) {
      if (signal.reason !== TEST_ENDED) throw error;
    } finally {
      inFlight.delete(call);
      request.signal.removeEventListener('abort', callerGaveUp);
    }
    // Called off by the end of its test: never answered, never rejected, as a call of a page that is closed.
    if (signal.reason === TEST_ENDED) return unanswered();
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
    endTest: async () => {
      for (const call of inFlight) call.abort(TEST_ENDED);
      inFlight.clear();
      // Each handler is waited for until it answers or reaches a hold, whenever it gets there: even one that has not
      // run its first line yet when the test ends is waited for no longer than it takes to reach `delay('infinite')`.
      const settling = [...running.values()];
      running.clear();
      if (settling.length === 0) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<'late'>((resolve) => {
        timer = setTimeout(() => {
          resolve('late');
        }, SETTLE_LIMIT_MS);
      });
      const settled = await Promise.race([Promise.all(settling), limit]);
      clearTimeout(timer);
      // Loud: a handler still writing after the reset would make the next test fail for no reason of its own.
      if (settled === 'late') {
        throw new Error(
          `a mock handler still ran ${String(SETTLE_LIMIT_MS)} ms after its test ended: hold it with held()`,
        );
      }
    },
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
