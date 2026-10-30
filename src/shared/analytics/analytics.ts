import type { AnalyticsConfig } from '@/shared/analytics/config';
import type { ConsentStatus } from '@/shared/analytics/consent';
import type { SafeStorage } from '@/shared/lib/safeStorage';

/** A property value PostHog stores as is: no object, so nothing nested can smuggle personal data. */
export type PropertyValue = string | number | boolean;

/** The random id of this browser, written only after a yes and removed on a no. */
export const ANONYMOUS_ID_KEY = 'ostrom.analytics.id';

/** Events wait this long before leaving, so that a burst leaves in one request. */
export const FLUSH_DELAY_MS = 2_000;

const MAX_BATCH = 50;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;

export interface Analytics {
  /** Records an event if analytics are configured and accepted; otherwise does nothing. */
  readonly capture: (event: string, properties?: Readonly<Record<string, PropertyValue>>) => void;
  /** Records a page view of [path], without its query string or fragment (a magic link carries a token there). */
  readonly pageview: (path: string) => void;
  /**
   * Links the next events to the signed-in user (an opaque id, never an e-mail) and their organization. Called before
   * a yes, the link is sent with the first event after it.
   */
  readonly identify: (userId: string, organizationId?: string) => void;
  /** On a refusal: drops what is queued and the browser id. The signed-in user is kept for a later yes. */
  readonly forget: () => void;
  /** On sign-out: forgets the user and starts a new browser id, so the next person is never merged with this one. */
  readonly reset: () => void;
  /** Sends what is queued now. */
  readonly flush: () => void;
}

export interface AnalyticsOptions {
  readonly config: AnalyticsConfig | null;
  readonly consent: () => ConsentStatus;
  readonly storage: SafeStorage;
  readonly send: (url: string, body: string) => void;
  readonly schedule: (task: () => void, delayMs: number) => void;
  readonly now: () => number;
  readonly newId: () => string;
  readonly origin: string;
}

interface QueuedEvent {
  readonly event: string;
  readonly distinct_id: string;
  readonly timestamp: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** The path of a URL or path, without query string or fragment. */
export function pathOnly(path: string): string {
  const bare = path.replace(/[?#].*$/, '');
  return bare === '' ? '/' : bare;
}

/**
 * A minimal PostHog client (`/batch/` endpoint): no autocapture, no session recording, no cookie, nothing stored or
 * sent before consent. posthog-js is not used: everything it adds beyond this is what the console turns off.
 */
export function createAnalytics(options: AnalyticsOptions): Analytics {
  const { config, storage } = options;
  let queue: QueuedEvent[] = [];
  // Each flush starts a new generation: a timer of an earlier one finds nothing to do.
  let generation = 0;
  let scheduled = false;
  let userId: string | undefined;
  let organizationId: string | undefined;
  // The user whose $identify left, so that it leaves once, after the yes.
  let linked: string | undefined;
  // Kept in memory too: with storage blocked, the id stays the same for the life of the page.
  let anonId: string | undefined;

  const enabled = (): boolean => config !== null && options.consent() === 'granted';

  const anonymousId = (): string => {
    anonId ??= storage.getItem(ANONYMOUS_ID_KEY) ?? options.newId();
    storage.setItem(ANONYMOUS_ID_KEY, anonId);
    return anonId;
  };

  const flush = (): void => {
    generation++;
    scheduled = false;
    const batch = queue;
    queue = [];
    // A withdrawal (the banner reopened, a refusal in another tab) also drops what was waiting.
    if (config === null || batch.length === 0 || !enabled()) return;
    options.send(`${config.host}/batch/`, JSON.stringify({ api_key: config.key, batch }));
  };

  const enqueue = (
    event: string,
    distinctId: string,
    properties: Readonly<Record<string, unknown>>,
  ): void => {
    const groups = organizationId === undefined ? {} : { $groups: { organization: organizationId } };
    queue.push({
      event,
      distinct_id: distinctId,
      timestamp: new Date(options.now()).toISOString(),
      // $geoip_disable: no city or country derived from the request's IP.
      properties: { ...properties, ...groups, $lib: 'ostrom-web', $geoip_disable: true },
    });
    if (queue.length >= MAX_BATCH) {
      flush();
    } else if (!scheduled) {
      scheduled = true;
      const mine = generation;
      options.schedule(() => {
        if (mine === generation) flush();
      }, FLUSH_DELAY_MS);
    }
  };

  /** The distinct id of the next event; sends the pending $identify first. Only called once enabled. */
  const distinctId = (): string => {
    if (userId === undefined) return anonymousId();
    if (linked !== userId) {
      linked = userId;
      enqueue('$identify', userId, { $anon_distinct_id: anonymousId() });
    }
    return userId;
  };

  const forgetBrowser = (): void => {
    queue = [];
    anonId = undefined;
    linked = undefined;
    storage.removeItem(ANONYMOUS_ID_KEY);
  };

  return {
    capture: (event, properties = {}) => {
      if (enabled()) enqueue(event, distinctId(), properties);
    },
    pageview: (path) => {
      if (!enabled()) return;
      const pathname = pathOnly(path);
      enqueue('$pageview', distinctId(), { $pathname: pathname, $current_url: options.origin + pathname });
    },
    identify: (user, organization) => {
      userId = user;
      organizationId = organization;
      if (enabled()) distinctId();
    },
    forget: forgetBrowser,
    reset: () => {
      flush();
      userId = undefined;
      organizationId = undefined;
      forgetBrowser();
    },
    flush,
  };
}

/** A random UUID v4 from `crypto.getRandomValues`, which, unlike `randomUUID`, also exists over plain http. */
export function randomId(random: (bytes: Uint8Array) => Uint8Array): string {
  const hex = Array.from(random(new Uint8Array(16)), (byte, index) => {
    // The version (4) and variant (10xx) bits of RFC 9562.
    if (index === VERSION_BYTE) return (byte & 0x0f) | 0x40;
    if (index === VARIANT_BYTE) return (byte & 0x3f) | 0x80;
    return byte;
  })
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Sends a batch without a preflight (`text/plain`) and without holding the page (`keepalive`); failures are dropped. */
export function sendWithFetch(url: string, body: string): void {
  fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(
    () => undefined,
  );
}
