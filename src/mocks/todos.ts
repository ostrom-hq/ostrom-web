// SPDX-License-Identifier: AGPL-3.0-only
import { handleGetSessionTodo, handleListTodoStopHooks, handleSetMemberTodoStopHook } from '@gen/api/msw.gen';
import type { Todo } from '@gen/api/types.gen';
import { zTodoStopHookRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from './http';

export interface TodosState {
  /** The session todos, by session id; a session without one has none. */
  todos: Record<string, Todo>;
  /** The members whose todo Stop hook an administrator turned off (everyone else has it on), by `Member.id`. */
  stopHookOff: string[];
}

export interface TodosAccess {
  /** The person is an owner or an admin of the organization the call acts in. */
  readonly manages: (request: Request) => boolean;
  /** The id is a member of the organization the call acts in. */
  readonly knows: (request: Request, memberId: string) => boolean;
}

/**
 * The session todos (`GET /api/v1/todos/session`, read-only for the console) and the per-member Stop hook switch,
 * as `todos` of ostrom-server serves them: an administrator lists the members whose hook is off and changes one.
 */
export function createTodosHandlers(state: () => TodosState, access: TodosAccess): HttpHandler[] {
  const managersOnly = (): ReturnType<typeof refusal> =>
    refusal(403, 'forbidden', 'Only an owner or an admin of the organization changes the todo Stop hook.');
  return [
    handleGetSessionTodo(({ request }) => {
      const sessionId = new URL(request.url).searchParams.get('sessionId');
      if (sessionId === null) return refusal(400, 'invalid_request', 'Name the session with sessionId.');
      return HttpResponse.json({ todo: state().todos[sessionId] ?? null });
    }),
    handleListTodoStopHooks(({ request }) => {
      if (!access.manages(request)) return managersOnly();
      return HttpResponse.json({
        members: state().stopHookOff.map((memberId) => ({ memberId, enabled: false })),
      });
    }),
    handleSetMemberTodoStopHook(async ({ request, params }) => {
      if (!access.manages(request)) return managersOnly();
      const s = state();
      const body = zTodoStopHookRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'Say enabled: true or false.');
      if (!access.knows(request, params.memberId)) return refusal(404, 'not_found', 'member not found');
      s.stopHookOff = s.stopHookOff.filter((id) => id !== params.memberId);
      if (!body.data.enabled) s.stopHookOff = [...s.stopHookOff, params.memberId];
      return HttpResponse.json({ memberId: params.memberId, enabled: body.data.enabled });
    }),
  ];
}
