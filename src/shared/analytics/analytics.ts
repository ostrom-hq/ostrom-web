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

export interface Analytics {
  /** Records an event if analytics are configured and accepted; otherwise does nothing. */
  readonly capture: (event: string, properties?: Readonly<Record<string, PropertyValue>>) => void;
  /** Records a page view of [path], without its query string or fragment (a magic link carries a token there). */
  readonly pageview: (path: string) => void;
  /** Links the next events to the signed-in user (an opaque id, never an e-mail) and their organization. */
  readonly identify: (userId: string, organizationId?: string) => void;
  /** Drops what is queued and the browser id: on a refusal, on sign-out. */
  readonly forget: () => void;
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
  let scheduled = false;
  let userId: string | undefined;
  let organizationId: string | undefined;

  const enabled = (): boolean => config !== null && options.consent() === 'granted';

  const anonymousId = (): string => {
    const existing = storage.getItem(ANONYMOUS_ID_KEY);
    if (existing !== null) return existing;
    const id = options.newId();
    storage.setItem(ANONYMOUS_ID_KEY, id);
    return id;
  };

  const flush = (): void => {
    scheduled = false;
    if (config === null || queue.length === 0) return;
    const body = JSON.stringify({ api_key: config.key, batch: queue });
    queue = [];
    options.send(`${config.host}/batch/`, body);
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
      properties: { ...properties, ...groups, $lib: 'ostrom-web' },
    });
    if (queue.length >= MAX_BATCH) {
      flush();
    } else if (!scheduled) {
      scheduled = true;
      options.schedule(flush, FLUSH_DELAY_MS);
    }
  };

  return {
    capture: (event, properties = {}) => {
      if (enabled()) enqueue(event, userId ?? anonymousId(), properties);
    },
    pageview: (path) => {
      if (!enabled()) return;
      const pathname = pathOnly(path);
      enqueue('$pageview', userId ?? anonymousId(), {
        $pathname: pathname,
        $current_url: options.origin + pathname,
      });
    },
    identify: (user, organization) => {
      const previous = userId;
      userId = user;
      organizationId = organization;
      if (enabled() && previous !== user) enqueue('$identify', user, { $anon_distinct_id: anonymousId() });
    },
    forget: () => {
      queue = [];
      userId = undefined;
      organizationId = undefined;
      storage.removeItem(ANONYMOUS_ID_KEY);
    },
    flush,
  };
}

/** Sends a batch without a preflight (`text/plain`) and without holding the page (`keepalive`); failures are dropped. */
export function sendWithFetch(url: string, body: string): void {
  fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(
    () => undefined,
  );
}
