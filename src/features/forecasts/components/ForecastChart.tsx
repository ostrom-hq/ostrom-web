// SPDX-License-Identifier: Apache-2.0
import type { ForecastWindow } from '@gen/api/types.gen';
import { type PointerEvent, type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { CHART, nearestIndex, type Point, projectionOf, scaleOf, segmentsOf } from '../model';

export interface ForecastChartProps {
  readonly window: ForecastWindow;
  /** The snapshot's time: « Now » on the chart. */
  readonly now: string;
  /** The account's ceiling, 0 to 1. */
  readonly threshold: number;
}

const GRID = [0, 0.5, 1] as const;

/**
 * TeamCode's window chart: the past hour's readings as solid lines, one per segment and never joined across a reset,
 * a drop or a gap; the projection as a dashed line from the latest reading to the threshold (or the reset); the
 * threshold; « Now ». Nothing is drawn where nothing was read. Hovering shows the nearest reading.
 */
export function ForecastChart({ window, now, threshold }: ForecastChartProps): ReactElement {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  // The place of the reading under the pointer: the points are rebuilt at each render, so never compared by identity.
  const [hoveredAt, setHoveredAt] = useState(-1);
  const scale = scaleOf(Date.parse(now));
  const segments = segmentsOf(window, scale);
  if (segments.length === 0) {
    return <p className="o-empty fc-chart__empty">{t('forecasts.chart.noReadings')}</p>;
  }
  const points = segments.flat();
  const hovered = points[hoveredAt];
  const projection = projectionOf(window, scale);
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 });
  const clock = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const reading = (point: Point): string =>
    t('forecasts.chart.reading', {
      value: percent.format(point.sample.utilization),
      when: formatAbsolute(point.sample.observedAt, i18n.language),
    });
  const track = (event: PointerEvent<SVGRectElement>): void => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (box === undefined || box.width <= 0) return;
    setHoveredAt(nearestIndex(points, ((event.clientX - box.left) / box.width) * CHART.width));
  };
  const nowX = scale.x(scale.now);
  const thresholdY = scale.y(threshold);
  return (
    <figure className="fc-chart">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${String(CHART.width)} ${String(CHART.height)}`}
        className="fc-chart__svg"
      >
        <title id={titleId}>{t('forecasts.chart.title', { window: window.window })}</title>
        {GRID.map((value) => (
          <g key={value} className="fc-chart__grid">
            <line x1={CHART.left} x2={CHART.right} y1={scale.y(value)} y2={scale.y(value)} />
            <text x={CHART.left - 8} y={scale.y(value) + 4} textAnchor="end">
              {percent.format(value)}
            </text>
          </g>
        ))}
        <line
          className="fc-chart__threshold"
          data-testid="threshold"
          x1={CHART.left}
          x2={CHART.right}
          y1={thresholdY}
          y2={thresholdY}
        />
        <text className="fc-chart__threshold-label" x={CHART.right} y={thresholdY - 6} textAnchor="end">
          {t('forecasts.chart.threshold', { value: percent.format(threshold) })}
        </text>
        <line className="fc-chart__now" x1={nowX} x2={nowX} y1={CHART.top} y2={CHART.bottom} />
        {segments.map((segment, index) => (
          <polyline
            // The segments come oldest first and only grow at the end: their place is their identity.
            key={index}
            className="fc-chart__measured"
            data-testid="measured"
            points={segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
          />
        ))}
        {points.map((point, index) => (
          <circle
            key={index}
            className="fc-chart__dot"
            cx={point.x}
            cy={point.y}
            r={index === hoveredAt ? 4 : 2.5}
          >
            <title>{reading(point)}</title>
          </circle>
        ))}
        {projection === undefined ? null : (
          <line
            className="fc-chart__projection"
            data-testid="projection"
            x1={projection.x1}
            y1={projection.y1}
            x2={projection.x2}
            y2={projection.y2}
          />
        )}
        {hovered === undefined ? null : (
          <line
            className="fc-chart__crosshair"
            x1={hovered.x}
            x2={hovered.x}
            y1={CHART.top}
            y2={CHART.bottom}
          />
        )}
        <g className="fc-chart__axis">
          <text x={CHART.left} y={CHART.height - 13}>
            {clock.format(scale.from)}
          </text>
          <text x={nowX} y={CHART.height - 13} textAnchor="middle">
            {t('forecasts.chart.now')}
          </text>
          <text x={CHART.right} y={CHART.height - 13} textAnchor="end">
            {clock.format(scale.until)}
          </text>
        </g>
        <rect
          className="fc-chart__hit"
          data-testid="hit"
          x={CHART.left}
          y={CHART.top}
          width={CHART.right - CHART.left}
          height={CHART.bottom - CHART.top}
          onPointerMove={track}
          onPointerLeave={() => {
            setHoveredAt(-1);
          }}
        />
      </svg>
      <figcaption className="fc-chart__tip" aria-live="polite">
        {hovered === undefined ? t('forecasts.chart.hint') : reading(hovered)}
      </figcaption>
    </figure>
  );
}
