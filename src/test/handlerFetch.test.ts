// SPDX-License-Identifier: AGPL-3.0-only
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createHandlerFetch, held } from '@/test/handlerFetch';

let wrote = false;
let release: () => void = () => undefined;

const server = setupServer(
  http.get('http://ostrom.test/held', async () => {
    await delay('infinite');
    return HttpResponse.json({});
  }),
  http.get('http://ostrom.test/gate', async () => {
    await held(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return HttpResponse.json({});
  }),
  http.post('http://ostrom.test/slow-write', async () => {
    await delay(100);
    wrote = true;
    return HttpResponse.json({});
  }),
  http.get('http://ostrom.test/now', () => HttpResponse.json({ ok: true })),
);

/** Where a call stands after a short while: answered, rejected, or still waiting. */
async function standing(call: Promise<unknown>): Promise<string> {
  return Promise.race([
    call.then(
      () => 'answered',
      () => 'rejected',
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('pending');
      }, 100);
    }),
  ]);
}

describe('createHandlerFetch', () => {
  it('leaves a call still waiting at the end of its test unanswered, and answers the next calls', async () => {
    const { fetch: answer, endTest } = createHandlerFetch(server);
    const waiting = answer('http://ostrom.test/held');
    expect(await (await answer('http://ostrom.test/now')).json()).toEqual({ ok: true });
    await endTest();
    // Neither an answer nor a rejection: no callback of the console runs, no unhandled rejection is left.
    expect(await standing(waiting)).toBe('pending');
    expect((await answer('http://ostrom.test/now')).status).toBe(200);
  });

  it('waits for a handler on a finite wait before the test ends, not for a held one', async () => {
    const { fetch: answer, endTest } = createHandlerFetch(server);
    wrote = false;
    void answer('http://ostrom.test/slow-write', { method: 'POST' });
    void answer('http://ostrom.test/held');
    void answer('http://ostrom.test/gate');
    const started = Date.now();
    await endTest();
    // The write came before the end: a database reset after `endTest` is never written by this handler.
    expect(wrote).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
    release();
  });

  it('still lets the caller give up first, with its own reason', async () => {
    const { fetch: answer, endTest } = createHandlerFetch(server);
    const caller = new AbortController();
    const waiting = answer('http://ostrom.test/held', { signal: caller.signal });
    caller.abort(new DOMException('Left the screen.', 'AbortError'));
    await expect(waiting).rejects.toThrow('Left the screen.');
    await endTest();
  });
});
