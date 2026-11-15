// SPDX-License-Identifier: Apache-2.0
import {
  handleCheckAgentPolicy,
  handleGetInferenceSettings,
  handleGetModelPolicy,
  handleSetInferenceSettings,
  handleSetModelPolicy,
} from '@gen/api/msw.gen';
import type {
  InferenceSettingsDto,
  MemberResponse,
  ModelPolicyDto,
  MeOrganizationResponse,
  SecretResponse,
} from '@gen/api/types.gen';
import { zInferenceSettingsDto, zModelPolicyDto } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { allows, MODEL_NAME } from '@/features/policy/model';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** Each organization's model policy and provider keys, as the gateway keeps them. */
export interface PolicyState extends OrgsState {
  /** The demo organization's members, whose ids a member's own list is keyed by. */
  members: MemberResponse[];
  secrets: SecretResponse[];
  /** By organization id; an organization never set has no list and no default. */
  modelPolicies: Record<string, StoredModelPolicy>;
  /** By organization id; never set, no key and shared accounts first. */
  inferenceSettings: Record<string, InferenceSettingsDto>;
}

/** A policy as the demo keeps it: the list and the default are always there, empty when the request named none. */
export interface StoredModelPolicy extends ModelPolicyDto {
  allowed: string[];
  default: string;
}

/** The demo organization's policy: Claude and GPT-5 models, Sonnet by default, Theo held to Haiku. */
export function initialModelPolicy(theo: string): StoredModelPolicy {
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
function policyRefusal(policy: StoredModelPolicy): string | undefined {
  const own = Object.entries(policy.byMember ?? {});
  if (own.some(([id]) => !UUID.test(id))) return 'byMember is keyed by member id.';
  if (own.some(([, models]) => models.length === 0)) return 'A member’s own list names at least one model.';
  const models = [...policy.allowed, policy.default, ...own.flatMap(([, list]) => list)];
  if (models.some((model) => !MODEL_NAME.test(model)))
    return "Models are names or prefixes of letters, digits, '.', '-', '_', ':' or '/'.";
  return undefined;
}

export function createPolicyHandlers(
  state: () => PolicyState,
  organizationOf: (request: Request) => MeOrganizationResponse,
): HttpHandler[] {
  const roleIn = (organization: MeOrganizationResponse) =>
    orgRoleOf(state().orgMembers[organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role);
  const policyOf = (organization: MeOrganizationResponse): StoredModelPolicy =>
    state().modelPolicies[organization.id] ?? { allowed: [], default: '' };
  const settingsOf = (organization: MeOrganizationResponse): InferenceSettingsDto =>
    state().inferenceSettings[organization.id] ?? { useSharedAccounts: true };
  const adminOnly = (organization: MeOrganizationResponse) =>
    managesMembers(roleIn(organization))
      ? undefined
      : refusal(403, 'forbidden', 'Only an owner or an admin changes the inference settings.');
  return [
    handleGetModelPolicy(({ request }) => HttpResponse.json(policyOf(organizationOf(request)))),
    handleSetModelPolicy(async ({ request }) => {
      const organization = organizationOf(request);
      const refused = adminOnly(organization);
      if (refused !== undefined) return refused;
      const body = zModelPolicyDto.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'The policy is not valid.');
      // No default reads as an empty one, which the gateway's model names refuse, as before the contract made it
      // optional (ostrom-core#48); no list reads as an empty one.
      const { byMember } = body.data;
      const policy: StoredModelPolicy = {
        allowed: body.data.allowed ?? [],
        default: body.data.default ?? '',
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
      const body = zInferenceSettingsDto.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'The settings are not valid.');
      const keys = [body.data.anthropicKeySecret, body.data.openaiKeySecret, body.data.openrouterKeySecret];
      if (keys.some((key) => typeof key === 'string' && !SECRET.test(key)))
        return refusal(400, 'invalid_request', 'A key is named by a secret of letters, digits, _ . -');
      const saved: InferenceSettingsDto = {
        ...(body.data.anthropicKeySecret === undefined
          ? {}
          : { anthropicKeySecret: body.data.anthropicKeySecret }),
        ...(body.data.openaiKeySecret === undefined ? {} : { openaiKeySecret: body.data.openaiKeySecret }),
        ...(body.data.openrouterKeySecret === undefined
          ? {}
          : { openrouterKeySecret: body.data.openrouterKeySecret }),
        useSharedAccounts: body.data.useSharedAccounts ?? true,
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
