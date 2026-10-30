import { analytics, analyticsConfig, browserAnalyticsOptions, PRIVACY_URL } from '@/shared/analytics';
import { createAnalytics, FLUSH_DELAY_MS } from '@/shared/analytics/analytics';
import { CONSENT_MAX_AGE_MS, CONSENT_STORAGE_KEY, useConsentStore } from '@/shared/analytics/consent';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('the console analytics', () => {
  it('are off in tests: no PostHog key is set', () => {
    expect(analyticsConfig).toBeNull();
    expect(PRIVACY_URL).toBe('https://ostrom.run/privacy');
  });

  it('follow a choice made in another tab, and forget this tab's browser id on a withdrawal', () => {
    const forget = vi.spyOn(analytics, 'forget');
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, at: Date.now() }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'ostrom.theme' }));
    expect(useConsentStore.getState().status).toBe('unknown');

    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_STORAGE_KEY }));
    expect(useConsentStore.getState().status).toBe('granted');
    expect(forget).not.toHaveBeenCalled();

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(useConsentStore.getState().status).toBe('unknown');
    expect(forget).toHaveBeenCalledTimes(1);
    forget.mockRestore();
  });

  it('flush when the tab is hidden, not when it shows again', () => {
    const flush = vi.spyOn(analytics, 'flush');
    const state = vi.spyOn(document, 'visibilityState', 'get');

    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).not.toHaveBeenCalled();

    state.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe('browserAnalyticsOptions', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useConsentStore.setState({ status: 'unknown', decidedAt: null });
    window.localStorage.clear();
  });

  it('wires consent, timers, a random browser id and fetch', async () => {
    vi.useFakeTimers({ now: new Date('2027-01-15T08:00:00Z') });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true, at: Date.now() }));
    useConsentStore.setState({ status: 'granted' });
    const client = createAnalytics(browserAnalyticsOptions({ key: 'phc_k', host: 'https://ph.example' }));

    client.pageview('/settings');
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://ph.example/batch/');
    const sentBody = init?.body;
    expect(typeof sentBody).toBe('string');
    const body = JSON.parse(sentBody as string) as { batch: { distinct_id: string; timestamp: string }[] };
    expect(body.batch[0]?.distinct_id).toMatch(UUID_V4);
    expect(body.batch[0]?.timestamp).toBe('2027-01-15T08:00:00.000Z');
    client.forget();
  });

  it('stops when the yes expired while the tab was open', () => {
    useConsentStore.setState({ status: 'granted', decidedAt: Date.now() - CONSENT_MAX_AGE_MS - 1 });
    const options = browserAnalyticsOptions({ key: 'phc_k', host: 'https://ph.example' });

    expect(options.consent()).toBe('unknown');
    expect(useConsentStore.getState().status).toBe('unknown');
  });
});
