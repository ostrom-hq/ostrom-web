// SPDX-License-Identifier: Apache-2.0
import type { ForecastWindow } from '@gen/api/types.gen';
import { CHART, etaOf, nearestIndex, projectionOf, scaleOf, segmentsOf, stateOf } from './model';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const at = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

function windowOf(overrides: Partial<ForecastWindow> = {}): ForecastWindow {
  return {
    window: 'five_hour',
    utilization: 0.1,
    observedAt: at(0),
    resetsAt: at(1_800_000),
    state: 'reset_first',
    pointsPerHour: 1,
    segments: [],
    learningSamples: 3,
    learningSpanMillis: 120_000,
    ...overrides,
  };
}

describe('stateOf', () => {
  it('keeps the states the server words, and reads any other value as unknown', () => {
    for (const state of ['unknown', 'stale', 'exhausted', 'idle', 'reset_first', 'exhausts_first']) {
      expect(stateOf({ state })).toBe(state);
    }
    expect(stateOf({ state: 'throttled' })).toBe('unknown');
  });
});

describe('etaOf', () => {
  it('says the reset comes first, the threshold is reached, or when; anything else is unknown', () => {
    expect(etaOf({ state: 'reset_first' })).toEqual({ kind: 'reset-first' });
    expect(etaOf({ state: 'exhausted' })).toEqual({ kind: 'already' });
    expect(etaOf({ state: 'exhausts_first', reachesThresholdAt: at(60_000) })).toEqual({
      kind: 'at',
      at: at(60_000),
    });
    expect(etaOf({ state: 'exhausts_first' })).toEqual({ kind: 'unknown' });
    for (const state of ['unknown', 'stale', 'idle', 'new'])
      expect(etaOf({ state })).toEqual({ kind: 'unknown' });
  });
});

describe('scaleOf', () => {
  it('puts the past hour left of now and the next hour right of it, and clamps a share to 0..1', () => {
    const scale = scaleOf(NOW);
    expect(scale.x(NOW - 3_600_000)).toBe(CHART.left);
    expect(scale.x(NOW)).toBe(334);
    expect(scale.x(NOW + 3_600_000)).toBe(CHART.right);
    expect(scale.y(0)).toBe(CHART.bottom);
    expect(scale.y(1)).toBe(CHART.top);
    expect(scale.y(1.4)).toBe(CHART.top);
    expect(scale.y(-0.2)).toBe(CHART.bottom);
  });
});

describe('segmentsOf', () => {
  it('keeps each segment apart and drops an empty one', () => {
    const scale = scaleOf(NOW);
    const segments = segmentsOf(
      {
        segments: [
          [
            { utilization: 0.1, observedAt: at(-900_000) },
            { utilization: 0.2, observedAt: at(-840_000) },
          ],
          [],
          [{ utilization: 0.1, observedAt: at(-420_000) }],
        ],
      },
      scale,
    );
    expect(segments.map((segment) => segment.length)).toEqual([2, 1]);
    expect(segments[0]?.[1]?.y).toBe(scale.y(0.2));
  });
});

describe('projectionOf', () => {
  const scale = scaleOf(NOW);

  it('stops at the reset when it comes before the threshold (TeamCode: x2 = 477.0)', () => {
    const projection = projectionOf(windowOf({ reachesThresholdAt: at(10_000_000) }), scale);
    expect(projection?.x1).toBe(334);
    expect(projection?.x2).toBe(477);
    expect(projection?.y2).toBeCloseTo(scale.y(0.105));
  });

  it('reaches the threshold when it comes first, and stops at the edge of the chart', () => {
    const exhausts = windowOf({
      state: 'exhausts_first',
      pointsPerHour: 120,
      reachesThresholdAt: at(900_000),
      resetsAt: at(7_200_000),
    });
    expect(projectionOf(exhausts, scale)?.x2).toBe(scale.x(NOW + 900_000));
    const far = windowOf({ state: 'reset_first', resetsAt: at(7_200_000) });
    expect(projectionOf(far, scale)?.x2).toBe(CHART.right);
    // The reset is unknown, the threshold time is: the projection still goes there.
    const noReset = windowOf({ state: 'exhausts_first', reachesThresholdAt: at(600_000) });
    delete noReset.resetsAt;
    expect(projectionOf(noReset, scale)?.x2).toBe(scale.x(NOW + 600_000));
  });

  it('stops where the window is full, never bent along the top of the chart', () => {
    const fast = windowOf({
      state: 'exhausts_first',
      utilization: 0.9,
      pointsPerHour: 60,
      resetsAt: at(7_200_000),
    });
    const projection = projectionOf(fast, scale);
    expect(projection?.x2).toBeCloseTo(scale.x(NOW + 600_000));
    expect(projection?.y2).toBeCloseTo(CHART.top);
  });

  it('never projects an unknown, stale, idle or exhausted window, nor one without a rate or an end', () => {
    for (const state of ['unknown', 'stale', 'idle', 'exhausted', 'other']) {
      expect(projectionOf(windowOf({ state }), scale)).toBeUndefined();
    }
    const noRate = windowOf();
    delete noRate.pointsPerHour;
    expect(projectionOf(noRate, scale)).toBeUndefined();
    expect(projectionOf(windowOf({ pointsPerHour: 0 }), scale)).toBeUndefined();
    expect(projectionOf(windowOf({ pointsPerHour: Number.POSITIVE_INFINITY }), scale)).toBeUndefined();
    const noEnd = windowOf();
    delete noEnd.resetsAt;
    expect(projectionOf(noEnd, scale)).toBeUndefined();
    expect(projectionOf(windowOf({ resetsAt: 'soon' }), scale)).toBeUndefined();
    expect(projectionOf(windowOf({ resetsAt: at(-60_000) }), scale)).toBeUndefined();
    expect(projectionOf(windowOf({ observedAt: 'never' }), scale)).toBeUndefined();
  });
});

describe('nearestIndex', () => {
  it('finds the reading nearest to the pointer, none on an empty chart', () => {
    const sample = { utilization: 0.1, observedAt: at(0) };
    const points = [
      { x: 100, y: 1, sample },
      { x: 200, y: 2, sample },
      { x: 300, y: 3, sample },
    ];
    expect(nearestIndex(points, 240)).toBe(1);
    expect(nearestIndex(points, 260)).toBe(2);
    expect(nearestIndex([], 260)).toBe(-1);
  });
});
