// SPDX-License-Identifier: AGPL-3.0-only
import { handleAnswerWait, handleCancelWait, handleGetWait, handleListWaits } from '@gen/api/msw.gen';
import type { Organization, Wait } from '@gen/api/types.gen';
import { zAnswerWaitBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { answeredThroughSession, PAGE } from '@/features/waits/model';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** The demo organization's waits, newest first, as ostrom-server keeps them (`automations_waits`). */
export interface WaitsState extends OrgsState {
  waits: Wait[];
}

/** The server's page is at most 100. */
const MAX_PAGE = 100;

const isDemoPerson = (who: string | undefined): boolean => who === MEMBER_IDS.maya || who === DEMO_LOGIN;

export function createWaitsHandlers(
  state: () => WaitsState,
  now: () => Date,
  organizationOf: (request: Request) => Organization,
  manages: () => boolean,
): HttpHandler[] {
  /** The wait the caller may read: theirs (asked of them or by them), or any for an administrator. */
  const find = (request: Request, id: string): Wait | undefined => {
    const wait = state().waits.find((item) => item.id === id);
    const inOrg = organizationOf(request).id === state().organization.id;
    return inOrg &&
      wait !== undefined &&
      (manages() || isDemoPerson(wait.assignee) || isDemoPerson(wait.createdBy))
      ? wait
      : undefined;
  };
  const save = (next: Wait): Wait => {
    const db = state();
    db.waits = db.waits.map((item) => (item.id === next.id ? next : item));
    return next;
  };
  const notFound = () => refusal(404, 'not_found', 'wait not found');
  return [
    handleListWaits(({ request }) => {
      // The demo keeps one set of waits, Acme's: another organization has none.
      if (organizationOf(request).id !== state().organization.id) return HttpResponse.json({ items: [] });
      const params = new URL(request.url).searchParams;
      const status = params.get('status') ?? 'open';
      const limit = Number(params.get('limit') ?? PAGE);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE)
        return refusal(400, 'invalid_request', 'limit must be from 1 to 100');
      const mine = params.get('mine') === 'true';
      const matching = state().waits.filter(
        (wait) =>
          (status === 'all' || wait.status === status) &&
          (mine ? isDemoPerson(wait.assignee) : isDemoPerson(wait.assignee) || isDemoPerson(wait.createdBy)),
      );
      const before = params.get('before');
      const from = before === null ? 0 : matching.findIndex((wait) => wait.id === before) + 1;
      if (from === 0 && before !== null)
        return refusal(400, 'invalid_cursor', 'The cursor is not one a previous page gave.');
      const items = matching.slice(from, from + limit);
      const last = items.at(-1);
      return HttpResponse.json(
        last !== undefined && from + limit < matching.length ? { items, next: last.id } : { items },
      );
    }),
    handleGetWait(({ request, params }) => {
      const wait = find(request, params.id);
      return wait === undefined ? notFound() : HttpResponse.json(wait);
    }),
    handleAnswerWait(async ({ request, params }) => {
      const wait = find(request, params.id);
      if (wait === undefined) return notFound();
      if (wait.status !== 'open')
        return refusal(409, 'wait_closed', 'This wait was already answered or cancelled.');
      if (answeredThroughSession(wait))
        return refusal(409, 'answer_through_session', 'Answer this request in its session.');
      if (!isDemoPerson(wait.assignee) && !manages())
        return refusal(403, 'wait_assignee_only', 'Only the member asked answers.');
      const body = zAnswerWaitBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'give an action and its values');
      const { action, values = {} } = body.data;
      const actions = wait.question.actions ?? [{ id: 'done', label: 'Done' }];
      const chosen = actions.find((item) => item.id === action);
      if (chosen === undefined) return refusal(400, 'invalid_answer', `unknown action ${action}`);
      const { fields = [] } = wait.question;
      const missing = fields.find(
        (field) =>
          (field.required === true || chosen.requires?.includes(field.id) === true) &&
          values[field.id] === undefined,
      );
      if (missing !== undefined) return refusal(400, 'invalid_answer', `field ${missing.id} is required`);
      const at = now().toISOString();
      return HttpResponse.json(
        save({
          ...wait,
          status: 'resolved',
          resolvedAt: at,
          answer: { action, values, author: MEMBER_IDS.maya, answeredAt: at },
        }),
      );
    }),
    handleCancelWait(({ request, params }) => {
      const wait = find(request, params.id);
      if (wait === undefined) return notFound();
      if (wait.status !== 'open')
        return refusal(409, 'wait_closed', 'This wait was already answered or cancelled.');
      return HttpResponse.json(save({ ...wait, status: 'cancelled', resolvedAt: now().toISOString() }));
    }),
  ];
}
