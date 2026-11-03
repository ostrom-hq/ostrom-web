// SPDX-License-Identifier: AGPL-3.0-only
import { BOOTED, bootFetch, bootKey, takeBooted } from '@/shared/api/bootFetch';

const ME = 'http://localhost/api/v1/auth/me';

function booted(entries: Record<string, unknown>): void {
  Reflect.set(globalThis, BOOTED, entries);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, BOOTED);
  vi.unstubAllGlobals();
});

describe('bootKey', () => {
  it('keeps the method, the path with its query, and the organization', () => {
    expect(bootKey('GET', 'http://localhost/api/v1/approvals?mine=true', 'org-1')).toBe(
      'GET /api/v1/approvals?mine=true org-1',
    );
    expect(bootKey('GET', '/api/v1/auth/me', null)).toBe('GET /api/v1/auth/me ');
  });
});

describe('takeBooted', () => {
  it('takes the booted call once, for the same organization only', async () => {
    const answer = new Response('{}');
    const store = { 'GET /api/v1/orgs org-1': Promise.resolve(answer) };
    const other = new Request('http://localhost/api/v1/orgs', { headers: { 'Ostrom-Org': 'org-2' } });
    expect(takeBooted(other, store)).toBeUndefined();
    const same = new Request('http://localhost/api/v1/orgs', { headers: { 'Ostrom-Org': 'org-1' } });
    await expect(takeBooted(same, store)).resolves.toBe(answer);
    expect(takeBooted(same, store)).toBeUndefined();
  });

  it('never takes a change, nor anything without a store or a promise in it', () => {
    const store = { 'POST /api/v1/auth/me ': Promise.resolve(new Response('{}')) };
    expect(takeBooted(new Request(ME, { method: 'POST' }), store)).toBeUndefined();
    expect(takeBooted(new Request(ME), undefined)).toBeUndefined();
    expect(takeBooted(new Request(ME), null)).toBeUndefined();
    expect(takeBooted(new Request(ME), { 'GET /api/v1/auth/me ': 'not a promise' })).toBeUndefined();
  });

  it('reads the store /boot.js leaves on the page by default', () => {
    booted({ 'GET /api/v1/auth/me ': Promise.resolve(new Response('{}')) });
    expect(takeBooted(new Request(ME))).toBeInstanceOf(Promise);
  });
});

describe('bootFetch', () => {
  it('answers with the booted response, without a second call', async () => {
    const network = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', network);
    const answer = new Response('{"booted":true}');
    booted({ 'GET /api/v1/auth/me ': Promise.resolve(answer) });
    await expect(bootFetch(new Request(ME))).resolves.toBe(answer);
    expect(network).not.toHaveBeenCalled();
  });

  it('makes the call when nothing was booted, or the booted one failed or is no response', async () => {
    const network = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{"network":true}')));
    vi.stubGlobal('fetch', network);
    booted({
      'GET /api/v1/auth/me ': Promise.reject(new Error('offline')),
      'GET /api/v1/orgs ': Promise.resolve('not a response'),
      'GET /api/v1/rules ': Promise.resolve(new Response('{}', { status: 401 })),
    });
    await bootFetch(new Request(ME));
    await bootFetch('http://localhost/api/v1/orgs');
    await bootFetch('http://localhost/api/v1/rules');
    await bootFetch('http://localhost/api/v1/me/organizations', { method: 'GET' });
    expect(network).toHaveBeenCalledTimes(4);
  });
});
