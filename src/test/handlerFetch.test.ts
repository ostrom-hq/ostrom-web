// SPDX-License-Identifier: AGPL-3.0-only
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createHandlerFetch } from '@/test/handlerFetch';

const server = setupServer(
  http.get('http://ostrom.test/held', async () => {
    await delay('infinite');
    return HttpResponse.json({});
  }),
  http.get('http://ostrom.test/now', () => HttpResponse.json({ ok: true })),
);

describe('createHandlerFetch', () => {
  it('calls off the calls still waiting, as aborted, and only those', async () => {
    const { fetch: answer, abortInFlight } = createHandlerFetch(server);
    const waiting = answer('http://ostrom.test/held');
    expect(await (await answer('http://ostrom.test/now')).json()).toEqual({ ok: true });
    abortInFlight();
    const error: unknown = await waiting.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DOMException);
    expect(error instanceof DOMException && error.name).toBe('AbortError');
    // Nothing left to call off: a new call is answered as before.
    expect((await answer('http://ostrom.test/now')).status).toBe(200);
  });

  it('still lets the caller give up first, with its own reason', async () => {
    const { fetch: answer, abortInFlight } = createHandlerFetch(server);
    const caller = new AbortController();
    const waiting = answer('http://ostrom.test/held', { signal: caller.signal });
    caller.abort(new DOMException('Left the screen.', 'AbortError'));
    await expect(waiting).rejects.toThrow('Left the screen.');
    abortInFlight();
  });
});
