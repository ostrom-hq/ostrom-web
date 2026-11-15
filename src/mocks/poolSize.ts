// SPDX-License-Identifier: Apache-2.0
import { handleGetPacingSettings, handleGetPoolSize, handleSetPacingSettings } from '@gen/api/msw.gen';
import type { PoolSize } from '@gen/api/types.gen';
import { zSetPacingSettingsBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface PoolSizeState {
  /** The capacity controller's settings. */
  pacingSettings: { observationOnly: boolean; autoPoolSize: boolean };
  /** The automatic value the job stored last, and when (ISO). */
  automaticDaily: { readonly micros: number; readonly computedAt: string } | undefined;
}

export function initialPoolSizeState(opened: number): PoolSizeState {
  return {
    pacingSettings: { observationOnly: false, autoPoolSize: false },
    automaticDaily: { micros: 38_500_000, computedAt: new Date(opened - 10 * 60_000).toISOString() },
  };
}

/** The organization's typed daily budget, USD millionths: none in the demo. */
const TYPED_DAILY_MICROS = 25_000_000;

/**
 * `/policy/pacing` and `/pools/size`, as ostrom-server serves them: any member reads the settings; owners and admins
 * read the pool size and change the settings (anyone else, 403), the write from a sign-in less than five minutes old
 * (403 `step_up_required`); a field left out of the write keeps its stored value. The automatic value replaces the
 * typed daily budget only while the setting is on and the value is under an hour old.
 */
export function createPoolSizeHandlers(
  state: () => PoolSizeState,
  access: {
    readonly manages: (request: Request) => boolean;
    readonly stale: () => boolean;
    readonly now: () => Date;
  },
): HttpHandler[] {
  const settings = () => state().pacingSettings;
  return [
    handleGetPacingSettings(() => HttpResponse.json(settings())),
    handleSetPacingSettings(async ({ request }) => {
      if (!access.manages(request))
        return refusal(403, 'forbidden', 'Only owners and admins change the controller settings.');
      if (access.stale())
        return refusal(403, 'step_up_required', 'Changing the settings needs a recent sign-in.');
      const body = zSetPacingSettingsBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'Settings are two true or false fields.');
      state().pacingSettings = {
        observationOnly: body.data.observationOnly ?? settings().observationOnly,
        autoPoolSize: body.data.autoPoolSize ?? settings().autoPoolSize,
      };
      return HttpResponse.json(settings());
    }),
    handleGetPoolSize(({ request }) => {
      if (!access.manages(request))
        return refusal(403, 'forbidden', 'Only owners and admins read the pool size.');
      const { automaticDaily } = state();
      const fresh =
        automaticDaily !== undefined &&
        access.now().getTime() - new Date(automaticDaily.computedAt).getTime() < 3_600_000;
      const inForce = settings().autoPoolSize && fresh ? automaticDaily : undefined;
      const size: PoolSize = {
        enabled: settings().autoPoolSize,
        manualDailyMicros: TYPED_DAILY_MICROS,
        ...(automaticDaily === undefined
          ? {}
          : { automaticDailyMicros: automaticDaily.micros, automaticComputedAt: automaticDaily.computedAt }),
        effectiveDailyMicros: inForce === undefined ? TYPED_DAILY_MICROS : inForce.micros,
        source: inForce === undefined ? 'manual' : 'automatic',
        estimatedDailyMicros: 36_000_000,
        unpricedModels: [],
        accounts: [
          {
            accountId: 'acc-1',
            status: 'counted',
            dailyMicros: 38_500_000,
            binding: 'five_hour',
            capacityDailyMicros: 60_000_000,
            windows: [
              { window: 'five_hour', fullWindowMicros: 5_000_000, capacityMicros: 5_500_000, samples: 5 },
            ],
            usage: [],
          },
          { accountId: 'acc-2', status: 'no_fresh_observation', dailyMicros: 0, windows: [], usage: [] },
        ],
        capacityDailyMicros: 60_000_000,
        capacityUnknownAccounts: 1,
        outsideUnknownAccounts: 0,
        models: [
          {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            inputTokens: 1_200_000,
            cacheWriteTokens: 0,
            cacheReadTokens: 800_000,
            outputTokens: 90_000,
            totalMicros: 7_500_000,
            unpricedTokens: 0,
          },
        ],
      };
      return HttpResponse.json(size);
    }),
  ];
}
