// SPDX-License-Identifier: Apache-2.0
import {
  handleAssignEnvironmentVariant,
  handleBulkAssignEnvironmentVariant,
  handleCreateEnvironmentVariant,
  handleDeleteEnvironmentVariant,
  handleExcludeEnvironmentVariable,
  handleIncludeEnvironmentVariable,
  handleListEnvironmentAssignments,
  handleListEnvironmentVariants,
  handleListPersonalEnvironmentVariants,
  handlePromoteEnvironmentVariant,
  handleUnassignEnvironmentVariant,
  handleUpdateEnvironmentVariant,
} from '@gen/api/msw.gen';
import type { EnvironmentAssignment, EnvironmentExclusion, EnvironmentVariant } from '@gen/api/types.gen';
import { zEnvironmentAssign, zEnvironmentVariantCreate, zEnvironmentVariantUpdate } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from './http';

/** Acme's environment variants (team and personal), assignments and exclusions; another organization has none. */
export interface EnvironmentState {
  environmentVariants: EnvironmentVariant[];
  environmentAssignments: EnvironmentAssignment[];
  environmentExclusions: EnvironmentExclusion[];
  nextEnvironmentVariant: number;
}

export interface EnvironmentDeps {
  /** The caller is an owner or an admin of the organization the request acts in. */
  readonly manages: (request: Request) => boolean;
  /** The request acts in the demo organization, the only one with data. */
  readonly inDemoOrg: (request: Request) => boolean;
  /** The ids of the organization's members who can receive a variable (not an invitation). */
  readonly memberIds: () => readonly string[];
  /** The sign-in is more than five minutes old: a write is refused with `step_up_required`. */
  readonly stale: () => boolean;
  readonly now: () => Date;
}

const VARIABLE = /^[A-Z_][A-Z0-9_]{0,127}$/;
/** A part of the server's reserved list (the contract gives it whole): enough for the demo to refuse one. */
const RESERVED = new Set(['PATH', 'HOME', 'USER', 'SHELL', 'NODE_OPTIONS', 'HTTPS_PROXY', 'HTTP_PROXY']);
const RESERVED_PREFIXES = [
  'LD_',
  'DYLD_',
  'OSTROM_',
  'TEAMCODE_',
  'ANTHROPIC_',
  'CLAUDE_',
  'OPENAI_',
  'CODEX_',
  'XDG_',
  'GIT_CONFIG_',
];

export function reservedVariable(name: string): boolean {
  return RESERVED.has(name) || RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function createEnvironmentHandlers(
  state: () => EnvironmentState,
  deps: EnvironmentDeps,
): HttpHandler[] {
  const guard = (request: Request, write: boolean): ReturnType<typeof refusal> | undefined => {
    if (!deps.manages(request))
      return refusal(403, 'forbidden', 'Only an owner or an admin manages environment variants.');
    if (write && deps.stale())
      return refusal(403, 'step_up_required', 'Sign in again: your sign-in is more than five minutes old.');
    return undefined;
  };
  const find = (request: Request, id: string): EnvironmentVariant | undefined =>
    deps.inDemoOrg(request) ? state().environmentVariants.find((variant) => variant.id === id) : undefined;
  const notFound = () => refusal(404, 'not_found', 'environment variant not found');
  const knownMember = (request: Request, member: string): boolean =>
    deps.inDemoOrg(request) && deps.memberIds().includes(member);
  const excluded = (member: string, variable: string): boolean =>
    state().environmentExclusions.some((item) => item.member === member && item.variable === variable);
  const dropAssignment = (member: string, variable: string): void => {
    const db = state();
    db.environmentAssignments = db.environmentAssignments.filter(
      (item) => !(item.member === member && item.variable === variable),
    );
  };
  const select = (assignment: EnvironmentAssignment): void => {
    dropAssignment(assignment.member, assignment.variable);
    const db = state();
    db.environmentAssignments = [...db.environmentAssignments, assignment];
  };
  const page = (request: Request, personal: boolean) =>
    HttpResponse.json({
      items: deps.inDemoOrg(request)
        ? state().environmentVariants.filter((variant) => (variant.owner !== undefined) === personal)
        : [],
    });
  return [
    handleListEnvironmentVariants(({ request }) => guard(request, false) ?? page(request, false)),
    handleListPersonalEnvironmentVariants(({ request }) => guard(request, false) ?? page(request, true)),
    handleCreateEnvironmentVariant(async ({ request }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      const body = zEnvironmentVariantCreate.safeParse(await readJson(request));
      if (!body.success || !VARIABLE.test(body.data.variable) || body.data.name.trim() === '')
        return refusal(400, 'invalid_environment_variant', 'A variable name and a variant name are needed.');
      if (reservedVariable(body.data.variable))
        return refusal(400, 'invalid_environment_variant', `${body.data.variable} is reserved.`);
      const binding = body.data.binding ?? 'shared';
      if ((binding === 'shared') !== (body.data.value !== undefined && body.data.value !== ''))
        return refusal(
          400,
          'invalid_environment_variant',
          'A shared variant needs its value; a per-member variant takes none.',
        );
      if (!deps.inDemoOrg(request))
        return refusal(403, 'forbidden', 'The demo keeps variants for its own organization only.');
      const db = state();
      if (
        db.environmentVariants.some(
          (variant) =>
            variant.owner === undefined &&
            variant.variable === body.data.variable &&
            sameName(variant.name, body.data.name),
        )
      )
        return refusal(409, 'variant_exists', 'A variant of this name exists for this variable.');
      const at = deps.now().toISOString();
      const variant: EnvironmentVariant = {
        id: `env-${String(db.nextEnvironmentVariant)}`,
        variable: body.data.variable,
        name: body.data.name.trim(),
        binding,
        hasValue: binding === 'shared',
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      db.nextEnvironmentVariant += 1;
      db.environmentVariants = [...db.environmentVariants, variant];
      return HttpResponse.json(variant, { status: 201 });
    }),
    handleUpdateEnvironmentVariant(async ({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      const variant = find(request, params.id);
      if (variant === undefined) return notFound();
      if (variant.owner !== undefined)
        return refusal(409, 'variant_personal', 'Only its owner edits a personal variant.');
      const body = zEnvironmentVariantUpdate.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_environment_variant', 'expectedVersion is needed.');
      if (body.data.expectedVersion !== variant.version)
        return refusal(409, 'variant_version_conflict', 'This variant changed since you read it: reload it.');
      if (body.data.value !== undefined && variant.binding !== 'shared')
        return refusal(400, 'invalid_environment_variant', 'A per-member variant stores no value.');
      const next: EnvironmentVariant = {
        ...variant,
        name: body.data.name ?? variant.name,
        version: variant.version + 1,
        updatedAt: deps.now().toISOString(),
      };
      const db = state();
      db.environmentVariants = db.environmentVariants.map((item) => (item.id === variant.id ? next : item));
      db.environmentAssignments = db.environmentAssignments.map((item) =>
        item.variantId === variant.id ? { ...item, variantName: next.name, version: next.version } : item,
      );
      return HttpResponse.json(next);
    }),
    handleDeleteEnvironmentVariant(({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      if (find(request, params.id) === undefined) return notFound();
      const db = state();
      db.environmentVariants = db.environmentVariants.filter((item) => item.id !== params.id);
      db.environmentAssignments = db.environmentAssignments.filter((item) => item.variantId !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    handleBulkAssignEnvironmentVariant(({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      const variant = find(request, params.id);
      if (variant === undefined) return notFound();
      if (variant.owner !== undefined)
        return refusal(409, 'variant_personal', 'A personal variant is its owner’s.');
      if (variant.binding !== 'shared')
        return refusal(409, 'variant_not_shared', 'A per-member variant is assigned one member at a time.');
      const result = { assigned: 0, keptDirect: 0, excluded: 0 };
      const at = deps.now().toISOString();
      for (const member of deps.memberIds()) {
        const current = state().environmentAssignments.find(
          (item) => item.member === member && item.variable === variant.variable,
        );
        if (excluded(member, variant.variable)) result.excluded += 1;
        else if (current?.source === 'direct') result.keptDirect += 1;
        else {
          result.assigned += 1;
          select({
            member,
            variable: variant.variable,
            variantId: variant.id,
            variantName: variant.name,
            version: variant.version,
            source: 'bulk',
            personal: false,
            hasMemberValue: false,
            assignedAt: at,
          });
        }
      }
      return HttpResponse.json(result);
    }),
    handlePromoteEnvironmentVariant(({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      const variant = find(request, params.id);
      if (variant === undefined) return notFound();
      if (variant.owner === undefined) return HttpResponse.json(variant);
      const db = state();
      if (
        db.environmentVariants.some(
          (item) =>
            item.owner === undefined &&
            item.variable === variant.variable &&
            sameName(item.name, variant.name),
        )
      )
        return refusal(409, 'variant_exists', 'A team variant of this name exists for this variable.');
      const promoted: EnvironmentVariant = { ...variant, updatedAt: deps.now().toISOString() };
      delete promoted.owner;
      db.environmentVariants = db.environmentVariants.map((item) =>
        item.id === variant.id ? promoted : item,
      );
      // Its former owner keeps the selection, now of a team variant.
      db.environmentAssignments = db.environmentAssignments.map((item) =>
        item.variantId === variant.id ? { ...item, personal: false } : item,
      );
      return HttpResponse.json(promoted);
    }),
    handleListEnvironmentAssignments(({ request }) => {
      const refused = guard(request, false);
      if (refused !== undefined) return refused;
      if (!deps.inDemoOrg(request)) return HttpResponse.json({ items: [], exclusions: [] });
      const member = new URL(request.url).searchParams.get('member');
      const mine = (item: { readonly member: string }): boolean => member === null || item.member === member;
      return HttpResponse.json({
        items: state().environmentAssignments.filter(mine),
        exclusions: state().environmentExclusions.filter(mine),
      });
    }),
    handleAssignEnvironmentVariant(async ({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      if (!knownMember(request, params.member)) return refusal(404, 'not_found', 'member not found');
      const body = zEnvironmentAssign.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'variantId is needed.');
      const variant = find(request, body.data.variantId);
      if (variant === undefined) return notFound();
      if (variant.owner !== undefined)
        return refusal(409, 'variant_personal', 'A personal variant is assigned to its owner alone.');
      if (variant.variable !== params.variable)
        return refusal(400, 'invalid_request', 'This variant is for another variable.');
      const value = body.data.value ?? '';
      if ((variant.binding === 'shared') === (value !== ''))
        return refusal(
          400,
          'invalid_request',
          'A per-member variant needs the member’s value; a shared one takes none.',
        );
      if (excluded(params.member, params.variable))
        return refusal(409, 'variant_excluded', 'This member is excluded from this variable.');
      const assignment: EnvironmentAssignment = {
        member: params.member,
        variable: variant.variable,
        variantId: variant.id,
        variantName: variant.name,
        version: variant.version,
        source: 'direct',
        personal: false,
        hasMemberValue: value !== '',
        assignedAt: deps.now().toISOString(),
      };
      select(assignment);
      return HttpResponse.json(assignment);
    }),
    handleUnassignEnvironmentVariant(({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      if (!knownMember(request, params.member)) return refusal(404, 'not_found', 'member not found');
      dropAssignment(params.member, params.variable);
      return new HttpResponse(null, { status: 204 });
    }),
    handleExcludeEnvironmentVariable(({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      if (!knownMember(request, params.member)) return refusal(404, 'not_found', 'member not found');
      if (!VARIABLE.test(params.variable)) return refusal(400, 'invalid_request', 'Not a variable name.');
      // An exclusion removes the current selection, the member's own included.
      dropAssignment(params.member, params.variable);
      if (!excluded(params.member, params.variable)) {
        const db = state();
        db.environmentExclusions = [
          ...db.environmentExclusions,
          { member: params.member, variable: params.variable },
        ];
      }
      return new HttpResponse(null, { status: 204 });
    }),
    handleIncludeEnvironmentVariable(({ request, params }) => {
      const refused = guard(request, true);
      if (refused !== undefined) return refused;
      if (!knownMember(request, params.member)) return refusal(404, 'not_found', 'member not found');
      // Removing an exclusion grants nothing back.
      const db = state();
      db.environmentExclusions = db.environmentExclusions.filter(
        (item) => !(item.member === params.member && item.variable === params.variable),
      );
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
