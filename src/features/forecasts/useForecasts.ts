// SPDX-License-Identifier: Apache-2.0
import { getForecastsOptions } from '@gen/api/@tanstack/react-query.gen';
import type { ForecastSnapshot } from '@gen/api/types.gen';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { FORECAST_POLL_MS } from './model';

export interface ForecastsViewModel {
  /** The latest snapshot of the account; the last one stays on screen while the next one loads. */
  readonly snapshot: ForecastSnapshot | undefined;
  readonly failure: Error | undefined;
  /** 403: only an owner or an admin reads the forecasts. */
  readonly forbidden: boolean;
  /** 404: no such account in this organization (another organization's, or removed). */
  readonly notFound: boolean;
  /** The live updates are paused by the person (TeamCode's « Pause live updates »). */
  readonly paused: boolean;
  readonly togglePaused: () => void;
  readonly refreshing: boolean;
  /** Reads the forecasts again now (TeamCode's « Show account / refresh »). */
  readonly refresh: () => void;
}

/**
 * TeamCode's Forecasts page, as a polled read instead of its server-sent stream: `GET /api/v1/forecasts` is read again
 * every 15 seconds while the tab is visible (React Query does not poll a hidden tab) and the person has not paused it.
 * A refusal (403, 404) stops the polling until the account changes.
 */
export function useForecasts(account: string | undefined): ForecastsViewModel {
  const [paused, setPaused] = useState(false);
  const query = useQuery(
    ready(getForecastsOptions(account === undefined ? {} : { query: { account } }), {
      refetchInterval: paused ? () => false : pollUnlessRefused(FORECAST_POLL_MS),
      placeholderData: keepPreviousData,
      retry: false,
    }),
  );
  const failure = failureOf(query.error);
  const kind = isApiFailure(failure) ? failure.kind : undefined;
  const { refetch } = query;
  return {
    snapshot: kind === 'forbidden' || kind === 'not-found' ? undefined : query.data,
    failure,
    forbidden: kind === 'forbidden',
    notFound: kind === 'not-found',
    paused,
    togglePaused: () => {
      setPaused((was) => !was);
    },
    refreshing: query.isFetching,
    refresh: () => {
      void refetch();
    },
  };
}
