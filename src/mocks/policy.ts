// SPDX-License-Identifier: Apache-2.0
import {
  handleCheckAgentPolicy,
  handleGetInferenceSettings,
  handleGetModelPolicy,
  handleSetInferenceSettings,
  handleSetModelPolicy,
} from '@gen/api/msw.gen';
import type { InferenceSettings, Member, ModelPolicy, Organization, Secret } from '@gen/api/types.gen';
import { zInferenceSettings, zModelPolicy } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { allows, MODEL_NAME } from '@/features/policy/model';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** Each organization's model policy and provider keys, as the gateway keeps them. */
export interface PolicyState extends OrgsState {
  /** The demo organization's members, whose ids a member's own list is keyed by. */
  members: Member[];
  secrets: Secret[];
  /** By organization id; an organization never set has no list and no default. */
  modelPolicies: Record<string, ModelPolicy>;
  /** By organization id; never set, no key and shared accounts first. */
  inferenceSettings: Record<string, InferenceSettings>;
}

/** The demo organization's policy: Claude and GPT-5 models, Sonnet by default, Theo held to Haiku. */
export function initialModelPolicy(theo: string): ModelPolicy {
  return {
    allowed: ['claude-', 'gpt-5'],
    default: 'claude-sonnet-4-5',
    byMember: { [theo]: ['claude-haiku'] },
  };
}

// The gateway's and the launch policy's names (ostrom-server GatewaySettingsUseCases, LaunchPolicy).
const AGENT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const LAUNCH_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,199}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_.-]{1,128}$/;

/** What the gateway refuses in a policy, or undefined when it takes it. */
function policyRefusal(policy: ModelPolicy): string | undefined {
  const own = Object.entries(policy.byMember ?? {});
  if (own.some(([id]) => !UUID.test(id))) return 'byMember is keyed by member id.';
  if (own.some(([, models]) => models.length === 0)) return 'A member’s own list names at least one model.';
  const models = [...policy.allowed, policy.default, ...own.flatMap(([, list]) => list)].filter(
    (model): model is string => model !== undefined,
  );
  if (models.some((model) => !MODEL_NAME.test(model)))
    return "Models are names or prefixes of letters, digits, '.', '-', '_', ':' or '/'.";
  return undefined;
}

export function createPolicyHandlers(
  state: () => PolicyState,
  organizationOf: (request: Request) => Organization,
): HttpHandler[] {
  const roleIn = (organization: Organization) =>
    orgRoleOf(state().orgMembers[organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role);
  const policyOf = (organization: Organization): ModelPolicy =>
    state().modelPolicies[organization.id] ?? { allowed: [], default: '' };
  const settingsOf = (organization: Organization): InferenceSettings =>
    state().inferenceSettings[organization.id] ?? { useSharedAccounts: true };
  const adminOnly = (organization: Organization) =>
    managesMembers(roleIn(organization))
      ? undefined
      : refusal(403, 'forbidden', 'Only an owner or an admin changes the inference settings.');
  return [
    handleGetModelPolicy(({ request }) => HttpResponse.json(policyOf(organizationOf(request)))),
    handleSetModelPolicy(async ({ request }) => {
      const organization = organizationOf(request);
      const refused = adminOnly(organization);
      if (refused !== undefined) return refused;
      const body = zModelPolicy.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'The policy is not valid.');
      // No default reads as an empty one, which the gateway's model names refuse, as before the contract made it
      // optional (ostrom-core#48).
      const { allowed, byMember, default: model = '' } = body.data;
      const policy: ModelPolicy = {
        allowed,
        default: model,
        ...(byMember === undefined ? {} : { byMember }),
      };
      const problem = policyRefusal(policy);
      if (problem !== undefined) return refusal(400, 'invalid_request', problem);
      state().modelPolicies[organization.id] = policy;
      return HttpResponse.json(policy);
    }),
    handleGetInferenceSettings(({ request }) => {
      const organization = organizationOf(request);
      return adminOnly(organization) ?? HttpResponse.json(settingsOf(organization));
    }),
    handleSetInferenceSettings(async ({ request }) => {
      const organization = organizationOf(request);
      const refused = adminOnly(organization);
      if (refused !== undefined) return refused;
      const body = zInferenceSettings.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'The settings are not valid.');
      const keys = [body.data.anthropicKeySecret, body.data.openaiKeySecret, body.data.openrouterKeySecret];
      if (keys.some((key) => key !== undefined && !SECRET.test(key)))
        return refusal(400, 'invalid_request', 'A key is named by a secret of letters, digits, _ . -');
      const saved: InferenceSettings = {
        ...(body.data.anthropicKeySecret === undefined
          ? {}
          : { anthropicKeySecret: body.data.anthropicKeySecret }),
        ...(body.data.openaiKeySecret === undefined ? {} : { openaiKeySecret: body.data.openaiKeySecret }),
        ...(body.data.openrouterKeySecret === undefined
          ? {}
          : { openrouterKeySecret: body.data.openrouterKeySecret }),
        useSharedAccounts: body.data.useSharedAccounts,
        // As the server: the members' limits are written with the rest, absent for none.
        ...(body.data.memberConcurrency === undefined
          ? {}
          : { memberConcurrency: body.data.memberConcurrency }),
      };
      state().inferenceSettings[organization.id] = saved;
      return HttpResponse.json(saved);
    }),
    // As the server: every well-formed agent; a billing member does not run agents; the model goes by the person's list.
    handleCheckAgentPolicy(({ request }) => {
      const organization = organizationOf(request);
      const query = new URL(request.url).searchParams;
      const agent = query.get('agent');
      const model = query.get('model');
      const refused = (reason: string) => HttpResponse.json({ allowed: false, reason });
      if (agent !== null && !AGENT.test(agent)) return refused('The agent name is not valid.');
      if (model !== null && !LAUNCH_MODEL.test(model)) return refused('The model name is not valid.');
      if (roleIn(organization) === 'billing') return refused('A billing member does not run agents.');
      if (model === null) return HttpResponse.json({ allowed: true });
      const policy = policyOf(organization);
      const me = state().members.find((member) => member.login === DEMO_LOGIN)?.id ?? '';
      const list = policy.byMember?.[me] ?? policy.allowed;
      return allows(list, model)
        ? HttpResponse.json({ allowed: true })
        : refused(`The organization does not allow ${model}.`);
    }),
  ];
}
