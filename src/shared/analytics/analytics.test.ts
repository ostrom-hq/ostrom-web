import {
  ANONYMOUS_ID_KEY,
  createAnalytics,
  FLUSH_DELAY_MS,
  pathOnly,
  sendWithFetch,
} from '@/shared/analytics/analytics';
import type { ConsentStatus } from '@/shared/analytics/consent';
import { createSafeStorage } from '@/shared/lib/safeStorage';

interface Sent {
  readonly url: string;
  readonly body: {
    api_key: string;
    batch: { event: string; distinct_id: string; timestamp: string; properties: Record<string, unknown> }[];
  };
}

function setup(consent: ConsentStatus = 'granted', configured = true) {
  const map = new Map<string, string>();
  const storage = createSafeStorage(
    () =>
      ({
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
        removeItem: (key: string) => {
          map.delete(key);
        },
      }) as Partial<Storage> as Storage,
  );
  const sent: Sent[] = [];
  const tasks: { task: () => void; delayMs: number }[] = [];
  let status = consent;
  let ids = 0;
  const analytics = createAnalytics({
    config: configured ? { key: 'phc_test', host: 'https://eu.i.posthog.com' } : null,
    consent: () => status,
    storage,
    send: (url, body) => {
      sent.push({ url, body: JSON.parse(body) as Sent['body'] });
    },
    schedule: (task, delayMs) => {
      tasks.push({ task, delayMs });
    },
    now: () => 1_800_000_000_000,
    newId: () => `anon-${String(++ids)}`,
    origin: 'https://app.ostrom.run',
  });
  const runScheduled = () => {
    tasks.splice(0).forEach(({ task }) => {
      task();
    });
  };
  return { analytics, sent, tasks, map, runScheduled, setConsent: (next: ConsentStatus) => (status = next) };
}

describe('createAnalytics', () => {
  it('sends nothing and stores nothing before a yes', () => {
    const { analytics, sent, tasks, map } = setup('unknown');
    analytics.pageview('/');
    analytics.capture('cta_clicked');
    analytics.identify('user-1');
    analytics.flush();

    expect(sent).toEqual([]);
    expect(tasks).toEqual([]);
    expect(map.size).toBe(0);
  });

  it('sends nothing without a configured project, even after a yes', () => {
    const { analytics, sent } = setup('granted', false);
    analytics.capture('x');
    analytics.flush();

    expect(sent).toEqual([]);
  });

  it('batches events to /batch/ after a short delay, with the path only', () => {
    const { analytics, sent, tasks, map, runScheduled } = setup();
    analytics.pageview('/yes/42?token=secret#frag');
    analytics.capture('gate_opened_in_client', { channel: 'web' });

    expect(tasks.map((it) => it.delayMs)).toEqual([FLUSH_DELAY_MS]);
    runScheduled();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://eu.i.posthog.com/batch/');
    const [pageview, gate] = sent[0]?.body.batch ?? [];
    expect(sent[0]?.body.api_key).toBe('phc_test');
    expect(pageview).toEqual({
      event: '$pageview',
      distinct_id: 'anon-1',
      timestamp: '2027-01-15T08:00:00.000Z',
      properties: { $pathname: '/yes/42', $current_url: 'https://app.ostrom.run/yes/42', $lib: 'ostrom-web' },
    });
    expect(gate?.properties).toEqual({ channel: 'web', $lib: 'ostrom-web' });
    expect(map.get(ANONYMOUS_ID_KEY)).toBe('anon-1');
    expect(JSON.stringify(sent)).not.toContain('secret');
  });

  it('identifies the user once, then groups events by organization', () => {
    const { analytics, sent } = setup();
    analytics.identify('user-1', 'org-1');
    analytics.identify('user-1', 'org-1');
    analytics.capture('member_invited');
    analytics.flush();

    const batch = sent[0]?.body.batch ?? [];
    expect(batch.map((it) => it.event)).toEqual(['$identify', 'member_invited']);
    expect(batch[0]?.properties['$anon_distinct_id']).toBe('anon-1');
    expect(batch[1]?.distinct_id).toBe('user-1');
    expect(batch[1]?.properties['$groups']).toEqual({ organization: 'org-1' });
  });

  it('a full batch leaves at once', () => {
    const { analytics, sent, tasks } = setup();
    for (let index = 0; index < 50; index++) analytics.capture('e');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.body.batch).toHaveLength(50);
    expect(tasks).toHaveLength(1);
  });

  it('forget drops the queue, the user and the browser id', () => {
    const { analytics, sent, map, runScheduled } = setup();
    analytics.identify('user-1', 'org-1');
    analytics.forget();
    runScheduled();
    expect(sent).toEqual([]);
    expect(map.has(ANONYMOUS_ID_KEY)).toBe(false);

    analytics.capture('after');
    analytics.flush();
    expect(sent[0]?.body.batch[0]?.distinct_id).toBe('anon-2');
    expect(sent[0]?.body.batch[0]?.properties['$groups']).toBeUndefined();
  });

  it('stops at once when consent is withdrawn', () => {
    const { analytics, sent, setConsent } = setup();
    setConsent('denied');
    analytics.capture('x');
    analytics.pageview('/');
    analytics.flush();

    expect(sent).toEqual([]);
  });
});

describe('pathOnly', () => {
  it('keeps the path of any URL-like string', () => {
    expect(pathOnly('/a/b?c=d')).toBe('/a/b');
    expect(pathOnly('?only=query')).toBe('/');
    expect(pathOnly('/x#y')).toBe('/x');
  });
});

describe('sendWithFetch', () => {
  it('posts text/plain with keepalive and swallows network failures', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);

    sendWithFetch('https://ph/batch/', '{}');
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith('https://ph/batch/', {
      method: 'POST',
      body: '{}',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
    });
    vi.unstubAllGlobals();
  });
});
