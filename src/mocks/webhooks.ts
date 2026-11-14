// SPDX-License-Identifier: Apache-2.0
import {
  handleCreateWebhook,
  handleDeleteWebhook,
  handleGetWebhook,
  handleListWebhookDeliveries,
  handleListWebhooks,
  handleRotateWebhookSecret,
  handleTestWebhook,
  handleUpdateWebhook,
} from '@gen/api/msw.gen';
import type { Organization, Webhook, WebhookDelivery } from '@gen/api/types.gen';
import { zCreateWebhookRequest, zUpdateWebhookRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { WEBHOOK_EVENT_TYPES } from '@/features/webhooks/model';
import { managesMembers } from '@/shared/org/roles';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { readJson, refusal } from './http';
import { demoRoleIn, type OrgsState } from './orgs';

/** The demo organization's outgoing webhooks and their delivery logs; another organization has none. */
export interface WebhooksState extends OrgsState {
  webhooks: Webhook[];
  /** By webhook id, newest first. */
  webhookDeliveries: Record<string, WebhookDelivery[]>;
  /** When each webhook's tests were queued (ms since the epoch), for the rate limit. */
  webhookTests: Record<string, number[]>;
  nextWebhook: number;
  nextDelivery: number;
  nextWebhookSecret: number;
}

/** The server's quota: 20 webhooks per organization. */
const MAX_WEBHOOKS = 20;
/** At most 3 tests in 10 seconds per webhook (429 `webhook_test_rate`, `Retry-After: 10`). */
const TEST_BURST = 3;
const TEST_WINDOW_MS = 10_000;

/** A secret the demo can show once: never one the real server would take. */
function secretOf(number: number): string {
  return `whsec_demo${String(number).padStart(4, '0')}mockmockmockmockmockmockmock`;
}

/** The server refuses a target that is not a public `https` address (loopback, private ranges, no credentials). */
function targetProblem(url: string): 'invalid' | 'host' | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'invalid';
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '')
    return 'invalid';
  if (url.length > 2048) return 'invalid';
  const host = parsed.hostname;
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.startsWith('10.') ||
    host.startsWith('127.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.');
  return privateHost ? 'host' : undefined;
}

export function createWebhooksHandlers(
  state: () => WebhooksState,
  now: () => Date,
  organizationOf: (request: Request) => Organization,
): HttpHandler[] {
  /** As the server: an owner or an admin acts on the demo organization's webhooks, any other caller is refused. */
  const guard = (request: Request): ReturnType<typeof refusal> | undefined =>
    managesMembers(demoRoleIn(state(), organizationOf(request), now))
      ? undefined
      : refusal(403, 'forbidden', 'Only an owner or an admin manages webhooks.');
  /** The demo keeps one set of webhooks, Acme's: another organization has none. */
  const inDemoOrg = (request: Request): boolean => organizationOf(request).id === state().organization.id;
  const find = (request: Request, id: string): Webhook | undefined =>
    inDemoOrg(request) ? state().webhooks.find((webhook) => webhook.id === id) : undefined;
  const save = (next: Webhook): Webhook => {
    const db = state();
    db.webhooks = db.webhooks.map((webhook) => (webhook.id === next.id ? next : webhook));
    return next;
  };
  const notFound = () => refusal(404, 'not_found', 'webhook not found');
  const typesProblem = (types: readonly string[]): boolean =>
    types.length < 1 ||
    types.length > 64 ||
    types.some((type) => !WEBHOOK_EVENT_TYPES.some((known) => known === type));
  return [
    handleListWebhooks(({ request }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      return HttpResponse.json({ items: inDemoOrg(request) ? state().webhooks : [] });
    }),
    handleCreateWebhook(async ({ request }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      const body = zCreateWebhookRequest.safeParse(await readJson(request));
      const description = body.success ? (body.data.description ?? '') : '';
      if (!body.success || typesProblem(body.data.types) || description.length > 200)
        return refusal(400, 'invalid_webhook', 'A webhook takes an https URL and 1 to 64 known event types.');
      const problem = targetProblem(body.data.url);
      if (problem === 'invalid')
        return refusal(400, 'invalid_webhook', 'The URL must be https, at most 2048 characters.');
      if (problem === 'host')
        return refusal(400, 'webhook_host_not_allowed', 'This address is not a public host.');
      const db = state();
      // The demo keeps webhooks for its own organization only.
      if (!inDemoOrg(request))
        return refusal(403, 'forbidden', 'The demo keeps webhooks for its own organization only.');
      if (db.webhooks.length >= MAX_WEBHOOKS)
        return refusal(409, 'webhook_limit', 'An organization has at most 20 webhooks.');
      const number = db.nextWebhook;
      db.nextWebhook += 1;
      const at = now().toISOString();
      const webhook: Webhook = {
        id: `wh-${String(number)}`,
        url: body.data.url,
        types: [...new Set(body.data.types)].sort(),
        description,
        enabled: true,
        createdBy: MEMBER_IDS.maya,
        createdAt: at,
        updatedAt: at,
        version: 1,
        consecutiveFailures: 0,
      };
      db.webhooks = [...db.webhooks, webhook];
      return HttpResponse.json({ webhook, secret: secretOf(number) }, { status: 201 });
    }),
    handleGetWebhook(({ request, params }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      const webhook = find(request, params.id);
      return webhook === undefined ? notFound() : HttpResponse.json(webhook);
    }),
    handleUpdateWebhook(async ({ request, params }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      const webhook = find(request, params.id);
      if (webhook === undefined) return notFound();
      const body = zUpdateWebhookRequest.safeParse(await readJson(request));
      const description = body.success ? (body.data.description ?? '') : '';
      if (!body.success || typesProblem(body.data.types) || description.length > 200)
        return refusal(400, 'invalid_webhook', 'A webhook takes an https URL and 1 to 64 known event types.');
      if (body.data.version !== webhook.version)
        return refusal(409, 'stale_version', 'This webhook changed since you read it: reload it.');
      const problem = targetProblem(body.data.url);
      if (problem === 'invalid')
        return refusal(400, 'invalid_webhook', 'The URL must be https, at most 2048 characters.');
      if (problem === 'host')
        return refusal(400, 'webhook_host_not_allowed', 'This address is not a public host.');
      // Absent keeps the state: editing a paused webhook never enables it again; enabling clears the failures.
      const enabled = body.data.enabled ?? webhook.enabled;
      const turnedOn = enabled && !webhook.enabled;
      const { disabledReason, ...rest } = webhook;
      const reason = enabled ? undefined : (disabledReason ?? 'disabled');
      return HttpResponse.json(
        save({
          ...rest,
          url: body.data.url,
          types: [...new Set(body.data.types)].sort(),
          description,
          enabled,
          ...(reason === undefined ? {} : { disabledReason: reason }),
          consecutiveFailures: turnedOn ? 0 : webhook.consecutiveFailures,
          version: webhook.version + 1,
          updatedAt: now().toISOString(),
        }),
      );
    }),
    handleDeleteWebhook(({ request, params }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      if (find(request, params.id) === undefined) return notFound();
      const db = state();
      db.webhooks = db.webhooks.filter((webhook) => webhook.id !== params.id);
      db.webhookDeliveries = Object.fromEntries(
        Object.entries(db.webhookDeliveries).filter(([id]) => id !== params.id),
      );
      return new HttpResponse(null, { status: 204 });
    }),
    handleListWebhookDeliveries(({ request, params }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      if (find(request, params.id) === undefined) return notFound();
      const raw = new URL(request.url).searchParams.get('limit');
      const limit = raw === null ? 50 : Number(raw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        return refusal(400, 'invalid_request', 'limit must be from 1 to 200');
      return HttpResponse.json({ items: (state().webhookDeliveries[params.id] ?? []).slice(0, limit) });
    }),
    handleTestWebhook(({ request, params }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      if (find(request, params.id) === undefined) return notFound();
      const db = state();
      const at = now().getTime();
      const recent = (db.webhookTests[params.id] ?? []).filter((time) => at - time < TEST_WINDOW_MS);
      if (recent.length >= TEST_BURST) {
        return HttpResponse.json(
          {
            error: {
              type: 'webhook_test_rate',
              message: 'At most 3 tests in 10 seconds: try again shortly.',
            },
          },
          { status: 429, headers: { 'Retry-After': '10' } },
        );
      }
      db.webhookTests[params.id] = [...recent, at];
      const number = db.nextDelivery;
      db.nextDelivery += 1;
      const delivery: WebhookDelivery = {
        id: `wd-${String(number)}`,
        eventType: 'webhook.test',
        state: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(at).toISOString(),
        createdAt: new Date(at).toISOString(),
        test: true,
      };
      db.webhookDeliveries[params.id] = [delivery, ...(db.webhookDeliveries[params.id] ?? [])];
      return HttpResponse.json(delivery, { status: 202 });
    }),
    handleRotateWebhookSecret(({ request, params }) => {
      const refused = guard(request);
      if (refused !== undefined) return refused;
      const webhook = find(request, params.id);
      if (webhook === undefined) return notFound();
      const db = state();
      const number = db.nextWebhookSecret;
      db.nextWebhookSecret += 1;
      return HttpResponse.json({ webhook, secret: secretOf(number) });
    }),
  ];
}
