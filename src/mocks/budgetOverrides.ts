// SPDX-License-Identifier: Apache-2.0
import {
  handleCreateBudgetOverride,
  handleListBudgetOverrides,
  handleRevokeBudgetOverride,
} from '@gen/api/msw.gen';
import type { BudgetOverride } from '@gen/api/types.gen';
import { zCreateBudgetOverrideBody, zRevokeBudgetOverrideBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface BudgetOverridesState {
  /** Every grant, of every member, oldest first. */
  budgetOverrides: BudgetOverride[];
}

const PAGE = 50;
const DAY_MS = 86_400_000;

/**
 * `/members/{login}/budget-overrides`, as ostrom-server serves them: owners and admins read, grant, replace and revoke
 * (anyone else, 403), a write needs a sign-in less than five minutes old (403 `step_up_required`), a login that is no
 * member is a 404. A grant ends at the earlier of its duration and the next midnight UTC; `replacesId` must name the
 * override in force (none without one), else 409 `stale_budget_override`.
 */
export function createBudgetOverridesHandlers(
  state: () => BudgetOverridesState,
  access: {
    readonly manages: (request: Request) => boolean;
    readonly stale: () => boolean;
    readonly knows: (request: Request, login: string) => boolean;
    readonly me: () => string;
  },
  now: () => Date,
): HttpHandler[] {
  const forbidden = () => refusal(403, 'forbidden', 'Only owners and admins manage temporary budgets.');
  const stepUp = () =>
    refusal(403, 'step_up_required', 'A temporary budget needs a sign-in less than five minutes old.');
  const noMember = () => refusal(404, 'not_found', 'No such member.');
  const stale = () =>
    refusal(
      409,
      'stale_budget_override',
      'The override in force changed: read it again before replacing it.',
    );
  const activeOf = (login: string): BudgetOverride | undefined => {
    const at = now().getTime();
    return state()
      .budgetOverrides.filter((item) => item.member === login)
      .find((item) => item.revokedAt === undefined && Date.parse(item.expiresAt) > at);
  };
  return [
    handleListBudgetOverrides(({ request, params }) => {
      if (!access.manages(request)) return forbidden();
      if (!access.knows(request, params.login)) return noMember();
      const before = new URL(request.url).searchParams.get('before');
      const all = state()
        .budgetOverrides.filter((item) => item.member === params.login)
        .toReversed();
      const start = before === null ? 0 : all.findIndex((item) => item.id === before) + 1;
      const items = all.slice(start, start + PAGE);
      const next = all.length > start + PAGE ? all[start + PAGE - 1] : undefined;
      const active = activeOf(params.login);
      return HttpResponse.json({
        items,
        ...(next === undefined ? {} : { next: next.id }),
        ...(active === undefined ? {} : { activeId: active.id }),
      });
    }),
    handleCreateBudgetOverride(async ({ request, params }) => {
      if (!access.manages(request)) return forbidden();
      if (access.stale()) return stepUp();
      if (!access.knows(request, params.login)) return noMember();
      const body = zCreateBudgetOverrideBody.safeParse(await readJson(request));
      if (!body.success || /[\r\n]/.test(body.data.reason) || body.data.reason.trim() === '')
        return refusal(
          400,
          'invalid_budget_override',
          'micros, durationMinutes 1 to 1440 and a one-line reason.',
        );
      const active = activeOf(params.login);
      if (body.data.replacesId !== active?.id) return stale();
      const at = now();
      const midnight = Math.floor(at.getTime() / DAY_MS) * DAY_MS + DAY_MS;
      const ends = Math.min(at.getTime() + body.data.durationMinutes * 60_000, midnight);
      if (active !== undefined) {
        // The one replaced ends now: it stays in the history, no longer in force.
        state().budgetOverrides = state().budgetOverrides.map((item) =>
          item.id === active.id ? { ...item, expiresAt: at.toISOString() } : item,
        );
      }
      const granted: BudgetOverride = {
        id: crypto.randomUUID(),
        member: params.login,
        micros: body.data.micros,
        createdAt: at.toISOString(),
        expiresAt: new Date(ends).toISOString(),
        reason: body.data.reason.trim(),
        createdBy: access.me(),
        ...(active === undefined ? {} : { replacesId: active.id }),
      };
      state().budgetOverrides = [...state().budgetOverrides, granted];
      return HttpResponse.json(granted, { status: 201 });
    }),
    handleRevokeBudgetOverride(async ({ request, params }) => {
      if (!access.manages(request)) return forbidden();
      if (access.stale()) return stepUp();
      const body = zRevokeBudgetOverrideBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_budget_override', 'A one-line reason.');
      const item = state().budgetOverrides.find(
        (candidate) => candidate.id === params.id && candidate.member === params.login,
      );
      if (item === undefined) return refusal(404, 'not_found', 'No such override.');
      if (item.revokedAt !== undefined) return HttpResponse.json(item);
      if (Date.parse(item.expiresAt) <= now().getTime()) return stale();
      const revoked: BudgetOverride = {
        ...item,
        revokedAt: now().toISOString(),
        revokedBy: access.me(),
        revocationReason: body.data.reason.trim(),
      };
      state().budgetOverrides = state().budgetOverrides.map((candidate) =>
        candidate.id === item.id ? revoked : candidate,
      );
      return HttpResponse.json(revoked);
    }),
  ];
}
