// SPDX-License-Identifier: Apache-2.0
import { handleGetApiPrices, handleLoadApiPriceDefaults, handleSetApiPrices } from '@gen/api/msw.gen';
import type { ApiPriceDto } from '@gen/api/types.gen';
import { zSetApiPricesBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface ApiPricesState {
  /** The organization's own rows; none: the built-in prices apply. */
  apiPrices: ApiPriceDto[];
}

/** A few of the gateway's built-in Anthropic list prices (read on 2026-10-21), micro-dollars a million tokens. */
export const BUILT_IN_PRICES: readonly ApiPriceDto[] = [
  {
    provider: 'anthropic',
    model: 'claude-opus-4',
    effectiveFrom: '2026-10-21',
    inputMicros: 15_000_000,
    cacheWriteMicros: 18_750_000,
    cacheReadMicros: 1_500_000,
    outputMicros: 75_000_000,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    effectiveFrom: '2026-10-21',
    inputMicros: 3_000_000,
    cacheWriteMicros: 3_750_000,
    cacheReadMicros: 300_000,
    outputMicros: 15_000_000,
  },
];

const key = (row: ApiPriceDto): string => `${row.provider}:${row.model}:${row.effectiveFrom}`;

/**
 * `/policy/api-prices`, as ostrom-server serves it: any member reads (the built-in rows with `defaults` while the
 * organization has none), owners and admins replace the table or load the built-in rows it lacks (anyone else, 403),
 * from a sign-in less than five minutes old (403 `step_up_required`); one row a provider, model and date, input and
 * output above 0, else 400 `invalid_api_price`.
 */
export function createApiPricesHandlers(
  state: () => ApiPricesState,
  access: { readonly manages: (request: Request) => boolean; readonly stale: () => boolean },
): HttpHandler[] {
  const table = () =>
    state().apiPrices.length === 0
      ? { prices: [...BUILT_IN_PRICES], defaults: true }
      : { prices: state().apiPrices, defaults: false };
  const refused = (request: Request) => {
    if (!access.manages(request))
      return refusal(403, 'forbidden', 'Only owners and admins change the prices.');
    if (access.stale())
      return refusal(403, 'step_up_required', 'Changing the prices needs a recent sign-in.');
    return undefined;
  };
  return [
    handleGetApiPrices(() => HttpResponse.json(table())),
    handleSetApiPrices(async ({ request }) => {
      const no = refused(request);
      if (no !== undefined) return no;
      const body = zSetApiPricesBody.safeParse(await readJson(request));
      const rows = body.success ? body.data.prices : [];
      if (!body.success || new Set(rows.map(key)).size !== rows.length)
        return refusal(
          400,
          'invalid_api_price',
          'One row a provider, model and date, input and output above 0.',
        );
      state().apiPrices = rows;
      return HttpResponse.json(table());
    }),
    handleLoadApiPriceDefaults(({ request }) => {
      const no = refused(request);
      if (no !== undefined) return no;
      const have = new Set(state().apiPrices.map(key));
      state().apiPrices = [...state().apiPrices, ...BUILT_IN_PRICES.filter((row) => !have.has(key(row)))];
      return HttpResponse.json(table());
    }),
  ];
}
