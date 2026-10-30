import {
  ANONYMOUS_ID_KEY,
  createAnalytics,
  FLUSH_DELAY_MS,
  pathOnly,
  randomId,
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

function setup(
  consent: ConsentStatus = 'granted',
  configured = true,
  stored: Record<string, string> = {},
  blocked = false,
) {
  const map = new Map<string, string>(Object.entries(stored));
  const storage = createSafeStorage(
    () =>
      ({
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (blocked) throw new DOMException('quota', 'QuotaExceededError');
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

  it('forget drops the queue and the browser id, and links the user again to the next one', () => {
    const { analytics, sent, map, runScheduled } = setup();
    analytics.identify('user-1', 'org-1');
    analytics.forget();
    runScheduled();
    expect(sent).toEqual([]);
    expect(map.has(ANONYMOUS_ID_KEY)).toBe(false);

    analytics.capture('after');
    analytics.flush();
    const batch = sent[0]?.body.batch ?? [];
    expect(batch.map((it) => it.event)).toEqual(['$identify', 'after']);
    expect(batch[0]?.properties['$anon_distinct_id']).toBe('anon-2');
    expect(batch[1]?.distinct_id).toBe('user-1');
  });

  it('a user signed in before the yes is linked with the first event after it', () => {
    const { analytics, sent, setConsent } = setup('unknown');
    analytics.identify('user-1');
    setConsent('granted');
    analytics.pageview('/');
    analytics.flush();

    const batch = sent[0]?.body.batch ?? [];
    expect(batch.map((it) => [it.event, it.distinct_id])).toEqual([
      ['$identify', 'user-1'],
      ['$pageview', 'user-1'],
    ]);
  });

  it('reset on sign-out sends what was waiting, then starts over with a new browser id', () => {
    const { analytics, sent, map } = setup();
    analytics.identify('user-1', 'org-1');
    analytics.capture('signed_out');
    analytics.reset();

    expect(sent[0]?.body.batch.map((it) => it.event)).toEqual(['$identify', 'signed_out']);
    expect(map.has(ANONYMOUS_ID_KEY)).toBe(false);

    analytics.capture('next_person');
    analytics.flush();
    const next = sent[1]?.body.batch[0];
    expect(next?.distinct_id).toBe('anon-2');
    expect(next?.properties['$groups']).toBeUndefined();
  });

  it('a withdrawal drops what was waiting', () => {
    const { analytics, sent, setConsent, runScheduled } = setup();
    analytics.capture('x');
    setConsent('unknown');
    runScheduled();
    analytics.flush();

    expect(sent).toEqual([]);
  });

  it('a timer of an earlier flush sends nothing; the next one sends the new events', () => {
    const { analytics, sent, tasks } = setup();
    analytics.capture('first');
    analytics.flush();
    analytics.capture('second');
    const [stale, current] = tasks.splice(0);

    stale?.task();
    expect(sent).toHaveLength(1);
    current?.task();
    expect(sent.map((it) => it.body.batch.map((event) => event.event))).toEqual([['first'], ['second']]);
  });

  it('reuses the stored browser id', () => {
    const { analytics, sent } = setup('granted', true, { [ANONYMOUS_ID_KEY]: 'stored-id' });
    analytics.capture('x');
    analytics.flush();

    expect(sent[0]?.body.batch[0]?.distinct_id).toBe('stored-id');
  });

  it('keeps one browser id for the page when storage is blocked', () => {
    const { analytics, sent } = setup('granted', true, {}, true);
    analytics.capture('a');
    analytics.capture('b');
    analytics.flush();

    expect(sent[0]?.body.batch.map((it) => it.distinct_id)).toEqual(['anon-1', 'anon-1']);
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

describe('randomId', () => {
  it('is a UUID v4 built from random bytes', () => {
    expect(randomId((bytes) => bytes.fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(randomId((bytes) => bytes.fill(0))).toBe('00000000-0000-4000-8000-000000000000');
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
