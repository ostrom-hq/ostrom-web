// SPDX-License-Identifier: Apache-2.0
import { handleGetWorkflowSettings, handleSaveWorkflowSettings } from '@gen/api/msw.gen';
import type { WorkflowEditors } from '@gen/api/types.gen';
import { zWorkflowEditors } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from '@/mocks/http';

export interface WorkflowSettingsState {
  workflowEditors: WorkflowEditors;
}

const MODES: ReadonlySet<string> = new Set(['all', 'admins', 'members']);

/**
 * `GET` and `PUT /workflows/settings`, as ostrom-server serves them: everyone in the organization reads who decides a
 * workflow without a gate node (`canEdit` says whether the caller is one of them); owners and admins change it.
 */
export function createWorkflowSettingsHandlers(
  state: () => WorkflowSettingsState,
  manages: (request: Request) => boolean,
): HttpHandler[] {
  return [
    handleGetWorkflowSettings(({ request }) => {
      const editors = state().workflowEditors;
      return HttpResponse.json({ editors, canEdit: manages(request) || editors.mode === 'all' });
    }),
    handleSaveWorkflowSettings(async ({ request }) => {
      if (!manages(request)) return refusal(403, 'forbidden', 'Only owners and admins change who decides.');
      const body = zWorkflowEditors.safeParse(await readJson(request));
      if (!body.success || !MODES.has(body.data.mode))
        return refusal(400, 'invalid_request', 'mode is all, admins or members');
      const editors: WorkflowEditors = {
        mode: body.data.mode,
        ...(body.data.mode === 'members' ? { memberIds: body.data.memberIds ?? [] } : {}),
      };
      state().workflowEditors = editors;
      return HttpResponse.json({ editors, canEdit: true });
    }),
  ];
}
