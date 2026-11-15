// SPDX-License-Identifier: Apache-2.0
import type { ForecastAccount, ForecastSample, ForecastWindow } from '@gen/api/types.gen';
import { z } from 'zod/mini';

/** `?account=`: the shared account shown, kept in the address so Back and a shared link keep it. */
export const forecastsSearchSchema = z.object({
  account: z.catch(z.optional(z.string().check(z.trim(), z.minLength(1), z.maxLength(128))), undefined),
});

/** TeamCode's live updates: the page reads the forecasts again at this pace while it is visible and not paused. */
export const FORECAST_POLL_MS = 15_000;

/** The states the server words; any other value reads as `unknown` (the contract's rule for an open enum). */
export type ForecastState = 'unknown' | 'stale' | 'exhausted' | 'idle' | 'reset_first' | 'exhausts_first';

const KNOWN_STATES: readonly ForecastState[] = [
  'unknown',
  'stale',
  'exhausted',
  'idle',
  'reset_first',
  'exhausts_first',
];

export function stateOf(window: Pick<ForecastWindow, 'state'>): ForecastState {
  return KNOWN_STATES.find((state) => state === window.state) ?? 'unknown';
}

/** What the card says of when the window reaches the threshold (TeamCode's « Pressure ETA »). */
export type Eta =
  | { readonly kind: 'reset-first' }
  | { readonly kind: 'already' }
  | { readonly kind: 'at'; readonly at: string }
  | { readonly kind: 'unknown' };

export function etaOf(window: Pick<ForecastWindow, 'state' | 'reachesThresholdAt'>): Eta {
  switch (stateOf(window)) {
    case 'reset_first':
      return { kind: 'reset-first' };
    case 'exhausted':
      return { kind: 'already' };
    case 'exhausts_first':
      return window.reachesThresholdAt === undefined
        ? { kind: 'unknown' }
        : { kind: 'at', at: window.reachesThresholdAt };
    case 'unknown':
    case 'stale':
    case 'idle':
      return { kind: 'unknown' };
  }
}

// TeamCode's chart: 640 × 220, the past hour on the left of « Now », the next hour on its right.
export const CHART = { width: 640, height: 220, left: 48, right: 620, top: 24, bottom: 180 } as const;
const HOUR_MS = 3_600_000;

/** The chart's two hours around `now` (ms since the epoch), and how a time and a share land on it. */
export interface ChartScale {
  readonly from: number;
  readonly now: number;
  readonly until: number;
  readonly x: (at: number) => number;
  readonly y: (utilization: number) => number;
}

export function scaleOf(now: number): ChartScale {
  const from = now - HOUR_MS;
  const until = now + HOUR_MS;
  const span = CHART.right - CHART.left;
  const height = CHART.bottom - CHART.top;
  return {
    from,
    now,
    until,
    x: (at) => CHART.left + ((at - from) / (until - from)) * span,
    y: (utilization) => CHART.bottom - Math.min(1, Math.max(0, utilization)) * height,
  };
}

/** One reading placed on the chart. */
export interface Point {
  readonly x: number;
  readonly y: number;
  readonly sample: ForecastSample;
}

/** Each segment as its own list of points: a reset, a drop or a gap starts a new line, never joined to the last. */
export function segmentsOf(window: Pick<ForecastWindow, 'segments'>, scale: ChartScale): Point[][] {
  return window.segments
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.map((sample) => ({
        x: scale.x(Date.parse(sample.observedAt)),
        y: scale.y(sample.utilization),
        sample,
      })),
    );
}

export interface Projection {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * TeamCode's conditional projection: from the latest reading, at the learned rate, until the window reaches the
 * threshold, resets, fills the window or leaves the chart, whichever comes first. Only where a rate is learned and the window fills up
 * before or after its reset; never for an unknown, stale, idle or exhausted window.
 */
export function projectionOf(window: ForecastWindow, scale: ChartScale): Projection | undefined {
  const state = stateOf(window);
  if (state !== 'reset_first' && state !== 'exhausts_first') return undefined;
  const rate = window.pointsPerHour;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return undefined;
  const ends = [window.reachesThresholdAt, window.resetsAt]
    .filter((at) => at !== undefined)
    .map((at) => Date.parse(at))
    .filter((at) => Number.isFinite(at));
  if (ends.length === 0) return undefined;
  const observed = Date.parse(window.observedAt);
  // A full window (100 %) is the top of the chart: the line stops there rather than bend along it.
  const full = observed + ((1 - window.utilization) / (rate / 100)) * HOUR_MS;
  const end = Math.min(...ends, full, scale.until);
  if (!Number.isFinite(observed) || end <= observed) return undefined;
  const projected = window.utilization + ((rate / 100) * (end - observed)) / HOUR_MS;
  return {
    x1: scale.x(observed),
    y1: scale.y(window.utilization),
    x2: scale.x(end),
    y2: scale.y(projected),
  };
}

/** The place of the reading nearest to `x` (in chart units), for the crosshair; -1 on an empty chart. */
export function nearestIndex(points: readonly Point[], x: number): number {
  let best = -1;
  points.forEach((point, index) => {
    const current = points[best];
    if (current === undefined || Math.abs(point.x - x) < Math.abs(current.x - x)) best = index;
  });
  return best;
}

/** TeamCode's account option: « label (e-mail) · provider ». */
export function accountOptionOf(account: ForecastAccount): string {
  const name =
    account.email === undefined || account.email === ''
      ? account.label
      : `${account.label} (${account.email})`;
  return `${name} · ${account.provider}`;
}
