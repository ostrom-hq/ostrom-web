// SPDX-License-Identifier: Apache-2.0
import {
  handleGetMemberPolicy,
  handleListPoolBudgets,
  handleSavePoolBudget,
  handleUpdateMemberPolicy,
} from '@gen/api/msw.gen';
import type { MemberPolicyResponse, PoolBudgetDto } from '@gen/api/types.gen';
import { zSavePoolBudgetBody, zUpdateMemberPolicyBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

/** A member's pools, as ostrom-server keeps them: no `poolId` is the shared home pool. */
export interface MockPoolPolicy {
  readonly poolId?: string;
  readonly allowSharedOverflow: boolean;
}

export interface PoolsState {
  /** The named pools' daily budgets, USD millionths. */
  poolBudgets: PoolBudgetDto[];
  /** By login; a member not here is in the shared home pool, without overflow. */
  memberPools: Record<string, MockPoolPolicy>;
}

export function initialPoolsState(): PoolsState {
  return {
    poolBudgets: [
      { poolId: 'reserve', dailyMicros: 15_000_000, sharedOverflow: true },
      { poolId: 'billing', dailyMicros: 40_000_000, sharedOverflow: false },
    ],
    memberPools: {
      maya: { poolId: 'billing', allowSharedOverflow: true },
      theo: { poolId: 'billing', allowSharedOverflow: false },
    },
  };
}

/** A pool identifier as the server takes it (TeamCode's). */
const POOL_ID = /^[A-Za-z0-9_-]{1,36}$/;
const MAX_DAILY_MICROS = 100_000_000_000;
const MAX_OVERFLOW_POOLS = 16;

/**
 * `/pools/budgets` and `/members/{login}/policy`, as ostrom-server serves them: owners and admins read and write the
 * budgets and every member's policy, a member reads their own policy only; TeamCode's refusals
 * (`invalid_pool_budget`, `invalid_overflow_pool`, `overflow_primary_pool`, `overflow_pool_limit`, `invalid_policy`).
 */
export function createPoolsHandlers(
  state: () => PoolsState,
  access: {
    readonly manages: (request: Request) => boolean;
    readonly knows: (request: Request, login: string) => boolean;
    readonly me: () => string;
  },
): HttpHandler[] {
  const policyOf = (login: string): MemberPolicyResponse => {
    const pools = state().memberPools[login];
    return {
      member: login,
      ...(pools?.poolId === undefined ? {} : { poolId: pools.poolId }),
      allowSharedOverflow: pools?.allowSharedOverflow === true,
    };
  };
  const isHome = (pool: string): boolean =>
    Object.values(state().memberPools).some((policy) => policy.poolId === pool);
  return [
    handleListPoolBudgets(({ request }) => {
      if (!access.manages(request))
        return refusal(403, 'forbidden', 'Only owners and admins read the pools.');
      return HttpResponse.json(state().poolBudgets);
    }),
    handleSavePoolBudget(async ({ request }) => {
      if (!access.manages(request))
        return refusal(403, 'forbidden', 'Only owners and admins change the pools.');
      const body = zSavePoolBudgetBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'A pool and its daily budget.');
      const { poolId, dailyMicros } = body.data;
      const shared = body.data.sharedOverflow === true;
      if (poolId === '' && shared)
        return refusal(400, 'invalid_overflow_pool', 'Shared overflow requires a named pool.');
      if (!POOL_ID.test(poolId) || dailyMicros < 1 || dailyMicros > MAX_DAILY_MICROS)
        return refusal(
          400,
          'invalid_pool_budget',
          'A named pool and a daily budget of 1 to 100,000 dollars.',
        );
      if (shared && isHome(poolId))
        return refusal(409, 'overflow_primary_pool', 'A shared overflow pool has no primary members.');
      const others = state().poolBudgets.filter((budget) => budget.poolId !== poolId);
      if (shared && others.filter((budget) => budget.sharedOverflow === true).length >= MAX_OVERFLOW_POOLS)
        return refusal(409, 'overflow_pool_limit', 'At most 16 pools are shared.');
      const saved: PoolBudgetDto = { poolId, dailyMicros, sharedOverflow: shared };
      state().poolBudgets = [...others, saved];
      return HttpResponse.json(saved);
    }),
    handleGetMemberPolicy(({ request, params }) => {
      const manages = access.manages(request);
      if (!manages && params.login !== access.me())
        return refusal(403, 'forbidden', 'A member reads their own policy only.');
      if (!access.knows(request, params.login)) return refusal(404, 'not_found', 'No such member.');
      return HttpResponse.json(policyOf(params.login));
    }),
    handleUpdateMemberPolicy(async ({ request, params }) => {
      if (!access.manages(request))
        return refusal(403, 'forbidden', 'Only owners and admins set a member’s pool.');
      if (!access.knows(request, params.login)) return refusal(404, 'not_found', 'No such member.');
      const body = zUpdateMemberPolicyBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'A pool, or an empty string for none.');
      const { poolId } = body.data;
      if (poolId !== '' && !POOL_ID.test(poolId))
        return refusal(400, 'invalid_policy', 'A pool is 1 to 36 letters, digits, underscores or hyphens.');
      if (state().poolBudgets.some((budget) => budget.poolId === poolId && budget.sharedOverflow === true))
        return refusal(409, 'overflow_primary_pool', 'A shared overflow pool is never a member’s home pool.');
      const allow = body.data.allowSharedOverflow ?? policyOf(params.login).allowSharedOverflow;
      state().memberPools = {
        ...state().memberPools,
        [params.login]: { ...(poolId === '' ? {} : { poolId }), allowSharedOverflow: allow },
      };
      return HttpResponse.json(policyOf(params.login));
    }),
  ];
}
