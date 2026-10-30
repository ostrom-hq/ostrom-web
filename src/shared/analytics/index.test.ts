import { analytics, analyticsConfig, browserAnalyticsOptions, PRIVACY_URL } from '@/shared/analytics';
import { createAnalytics, FLUSH_DELAY_MS } from '@/shared/analytics/analytics';
import { useConsentStore } from '@/shared/analytics/consent';

describe('the console analytics', () => {
  it('are off in tests: no PostHog key is set', () => {
    expect(analyticsConfig).toBeNull();
    expect(PRIVACY_URL).toBe('https://ostrom.run/privacy');
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
    useConsentStore.setState({ status: 'unknown' });
  });

  it('wires consent, timers, a random browser id and fetch', async () => {
    vi.useFakeTimers({ now: new Date('2027-01-15T08:00:00Z') });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
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
    expect(body.batch[0]?.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.batch[0]?.timestamp).toBe('2027-01-15T08:00:00.000Z');
    client.forget();
  });
});
