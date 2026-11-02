// SPDX-License-Identifier: AGPL-3.0-only
import { handleCreateAutomation, handleSaveAutomation } from '@gen/api/msw.gen';
import type { ApiError, Automation } from '@gen/api/types.gen';
import { zAutomationWrite } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import type { z } from 'zod';
import { readJson, refusal } from '@/mocks/http';

export interface AutomationWritesState {
  automations: Automation[];
}

/** A body as the contract's schema read it. */
type Write = z.infer<typeof zAutomationWrite>;

/** The demo's webhook address, as the server builds it from its public URL. */
const WEBHOOK_BASE = 'https://api.ostrom.run/api/v1/automations';

/**
 * The server's checks that the console's form does not make itself (`AutomationRules`, `AutomationRequest`): a
 * workflow action, an unknown overlap. The rest the form already refuses; the server says it again in its own words.
 */
function refusalOf(write: Write): HttpResponse<ApiError> | undefined {
  if (write.action.workflowId !== undefined)
    return refusal(
      400,
      'invalid_request',
      'Workflow actions are not available yet: give the action a prompt.',
    );
  if (write.overlap !== undefined && write.overlap !== 'skip' && write.overlap !== 'allow')
    return refusal(400, 'invalid_request', 'overlap is skip or allow.');
  if (
    write.trigger.kind === 'webhook' &&
    (write.trigger.cron !== undefined || write.trigger.timezone !== undefined)
  )
    return refusal(400, 'invalid_request', 'A webhook trigger has no cron nor timezone.');
  return undefined;
}

/** The server's defaults where a write is silent; the parsed body's absent fields stay absent. */
function definitionOf(write: Write): Pick<
  Automation,
  'name' | 'trigger' | 'action' | 'variables' | 'overlap' | 'maxRunsPerDay'
> & {
  samplePayload?: unknown;
} {
  const { trigger, action } = write;
  return {
    name: write.name.trim(),
    trigger: {
      kind: trigger.kind,
      ...(trigger.cron === undefined ? {} : { cron: trigger.cron }),
      ...(trigger.timezone === undefined ? {} : { timezone: trigger.timezone }),
      ...(trigger.kind === 'cron' ? { catchup: trigger.catchup ?? 'once' } : {}),
    },
    action: {
      agent: action.agent ?? 'claude',
      prompt: action.prompt ?? '',
      ...(action.model === undefined ? {} : { model: action.model }),
      maxRuntimeMinutes: action.maxRuntimeMinutes ?? 60,
    },
    variables: (write.variables ?? []).map((variable) => ({
      name: variable.name,
      path: variable.path,
      type: variable.type,
      values: variable.values ?? [],
      required: variable.required ?? true,
      sensitive: variable.sensitive ?? false,
    })),
    ...(write.samplePayload === undefined ? {} : { samplePayload: write.samplePayload }),
    overlap: write.overlap ?? 'skip',
    maxRunsPerDay: write.maxRunsPerDay ?? 24,
  };
}

/**
 * `POST` and `PUT /automations`, as ostrom-server serves them: a new automation is the caller's, paused, version 1,
 * and a webhook's answer carries its secret once; only its owner changes it, over the version they read.
 */
export function createAutomationWriteHandlers(
  state: () => AutomationWritesState,
  /** The person calling, as a new automation names its owner; then every name they own one by. */
  caller: readonly [string, ...string[]],
  now: () => Date,
): HttpHandler[] {
  const [owner] = caller;
  return [
    handleCreateAutomation(async ({ request }) => {
      const body = zAutomationWrite.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a name, a trigger and an action are needed');
      const refused = refusalOf(body.data);
      if (refused !== undefined) return refused;
      const s = state();
      const at = now().toISOString();
      const id = `au-${String(s.automations.length + 100)}`;
      const webhook = body.data.trigger.kind === 'webhook';
      const automation: Automation = {
        id,
        owner,
        enabled: false,
        ...definitionOf(body.data),
        ...(webhook ? { webhookUrl: `${WEBHOOK_BASE}/${id}/trigger` } : {}),
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      s.automations = [automation, ...s.automations];
      return HttpResponse.json(
        webhook ? { ...automation, secret: `whsec_mock_${id}${now().getTime().toString(36)}` } : automation,
        { status: 201 },
      );
    }),
    handleSaveAutomation(async ({ request, params }) => {
      const s = state();
      const index = s.automations.findIndex((item) => item.id === params.id);
      const current = s.automations[index];
      if (current === undefined) return refusal(404, 'not_found', 'Automation not found.');
      if (!caller.includes(current.owner))
        return refusal(403, 'forbidden', 'Only the owner of an automation does this.');
      const body = zAutomationWrite.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a name, a trigger and an action are needed');
      if (body.data.version === undefined)
        return refusal(400, 'invalid_request', 'A change gives the version it read.');
      if (body.data.version !== current.version)
        return refusal(409, 'conflict', 'The automation changed since you read it: reload it and try again.');
      const refused = refusalOf(body.data);
      if (refused !== undefined) return refused;
      const webhook = body.data.trigger.kind === 'webhook';
      // A sample or a webhook address the new definition does not have is gone with the old one.
      const kept: Automation = { ...current };
      delete kept.samplePayload;
      delete kept.webhookUrl;
      const saved: Automation = {
        ...kept,
        ...definitionOf(body.data),
        ...(webhook ? { webhookUrl: `${WEBHOOK_BASE}/${current.id}/trigger` } : {}),
        version: current.version + 1,
        updatedAt: now().toISOString(),
      };
      s.automations[index] = saved;
      return HttpResponse.json(saved);
    }),
  ];
}
