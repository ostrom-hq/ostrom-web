// SPDX-License-Identifier: Apache-2.0
import { handleGetForecasts } from '@gen/api/msw.gen';
import type {
  ForecastAccountResponse,
  ForecastSampleResponse,
  ForecastSnapshotResponse,
  ForecastWindowResponse,
  MeOrganizationResponse,
  SharedAccountResponse,
} from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { managesMembers } from '@/shared/org/roles';
import { refusal } from './http';
import { demoRoleIn, type OrgsState } from './orgs';

/** The forecasts the demo shows: each shared account's windows, by account id; another organization has none. */
export interface ForecastsState extends OrgsState {
  sharedAccounts: SharedAccountResponse[];
  forecastWindows: Record<string, ForecastWindowResponse[]>;
  /** The accounts' ceiling (TeamCode's 95 % by default). */
  forecastThreshold: number;
  /** The server cut the answer at one of its bounds. */
  forecastsTruncated: boolean;
}

const MINUTE = 60_000;

function iso(at: number): string {
  return new Date(at).toISOString();
}

/** One reading a minute from `start` minutes ago, rising by `step` from `first`. */
function readings(
  opened: number,
  start: number,
  count: number,
  first: number,
  step: number,
): ForecastSampleResponse[] {
  return Array.from({ length: count }, (_, index) => ({
    utilization: first + index * step,
    observedAt: iso(opened - (start - index) * MINUTE),
  }));
}

/**
 * Maya's Claude Max fills its five-hour window before the reset, with a reset in the past hour (two segments); its
 * weekly window resets first; a model window has no rate yet. Theo's ChatGPT Pro is idle on one window and exhausted
 * on another. The imported Team Max has no reading yet.
 */
export function initialForecastWindows(opened: number): Record<string, ForecastWindowResponse[]> {
  return {
    'acc-1': [
      {
        window: 'five_hour',
        utilization: 0.62,
        observedAt: iso(opened),
        resetsAt: iso(opened + 150 * MINUTE),
        state: 'exhausts_first',
        pointsPerHour: 60,
        reachesThresholdAt: iso(opened + 33 * MINUTE),
        segments: [readings(opened, 50, 10, 0.7, 0.02), readings(opened, 30, 31, 0.32, 0.01)],
        learningSamples: 31,
        learningSpanMillis: 30 * MINUTE,
      },
      {
        window: 'seven_day',
        utilization: 0.41,
        observedAt: iso(opened),
        resetsAt: iso(opened + 40 * MINUTE),
        state: 'reset_first',
        pointsPerHour: 2.4,
        segments: [readings(opened, 20, 21, 0.402, 0.0004)],
        learningSamples: 21,
        learningSpanMillis: 20 * MINUTE,
      },
      {
        window: 'model:opus',
        utilization: 0.2,
        observedAt: iso(opened),
        state: 'unknown',
        segments: [readings(opened, 1, 2, 0.2, 0)],
        learningSamples: 2,
        learningSpanMillis: MINUTE,
      },
    ],
    'acc-2': [
      {
        window: 'five_hour',
        utilization: 0.12,
        observedAt: iso(opened),
        resetsAt: iso(opened + 200 * MINUTE),
        state: 'idle',
        pointsPerHour: 0,
        segments: [readings(opened, 10, 11, 0.12, 0)],
        learningSamples: 11,
        learningSpanMillis: 10 * MINUTE,
      },
      {
        window: 'seven_day',
        utilization: 0.97,
        observedAt: iso(opened),
        resetsAt: iso(opened + 3 * 24 * 60 * MINUTE),
        state: 'exhausted',
        pointsPerHour: 0.5,
        segments: [readings(opened, 5, 6, 0.96, 0.002)],
        learningSamples: 6,
        learningSpanMillis: 5 * MINUTE,
      },
    ],
  };
}

function forecastAccountOf(account: SharedAccountResponse): ForecastAccountResponse {
  return {
    id: account.id,
    provider: account.provider,
    label: account.label,
    status: account.status,
    paused: account.paused ?? false,
    ...(account.email === undefined ? {} : { email: account.email }),
  };
}

export function createForecastsHandlers(
  state: () => ForecastsState,
  now: () => Date,
  organizationOf: (request: Request) => MeOrganizationResponse,
): HttpHandler[] {
  return [
    handleGetForecasts(({ request }) => {
      const db = state();
      const organization = organizationOf(request);
      // As the server: an owner or an admin of the organization, signed in; anyone else is refused.
      if (!managesMembers(demoRoleIn(db, organization, now)))
        return refusal(403, 'forbidden', 'Only an owner or an admin reads the forecasts.');
      const asked = new URL(request.url).searchParams.getAll('account');
      if (asked.length > 1) return refusal(400, 'invalid_account', 'Name one account.');
      // The demo keeps Acme's accounts only: another organization lists none, and knows none by id.
      const accounts = (organization.id === db.organization.id ? db.sharedAccounts : [])
        .map(forecastAccountOf)
        .toSorted((a, b) => a.id.localeCompare(b.id));
      const wanted = asked[0];
      const account = wanted === undefined ? accounts[0] : accounts.find((item) => item.id === wanted);
      if (wanted !== undefined && account === undefined)
        return refusal(404, 'not_found', 'No such account in this organization.');
      const snapshot: ForecastSnapshotResponse = {
        generatedAt: now().toISOString(),
        accounts,
        ...(account === undefined ? {} : { account }),
        windows: account === undefined ? [] : (db.forecastWindows[account.id] ?? []),
        truncated: db.forecastsTruncated,
        pressureThreshold: db.forecastThreshold,
      };
      return HttpResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
    }),
  ];
}
