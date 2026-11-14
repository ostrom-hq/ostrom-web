// SPDX-License-Identifier: Apache-2.0
import {
  handleClearHookAssignment,
  handleClearSkillAssignment,
  handleGetHookDelivery,
  handleGetMemberHookDelivery,
  handleGetMemberSkillDelivery,
  handleGetSkillDelivery,
  handleListHookAssignments,
  handleListHooks,
  handleListHookVersions,
  handleListMemberSkillInstallations,
  handleListMySkillInstallations,
  handleListMySkills,
  handleListMySkillVersions,
  handleListSkillAssignments,
  handleListSkills,
  handleListSkillVersions,
  handlePinHook,
  handlePinMySkill,
  handlePinSkill,
  handlePromoteSkill,
  handleReadHookVersion,
  handleRestoreMySkill,
  handleRestoreSkill,
  handleRetireMySkill,
  handleRetireSkill,
  handleRetireSkillVersion,
  handleSetHookAssignment,
  handleSetHookAudience,
  handleSetSkillAssignment,
  handleSetSkillAudience,
  handleUnpinHook,
  handleUnpinMySkill,
  handleUnpinSkill,
} from '@gen/api/msw.gen';
import type {
  ArtifactFileContent,
  Assignment,
  EffectiveHook,
  EffectiveSkill,
  HookEntry,
  HookVersion,
  Member,
  Organization,
  SkillEntry,
  SkillInstallation,
  SkillVersion,
} from '@gen/api/types.gen';
import { zPinSkillRequest, zSetAssignmentRequest, zSetAudienceRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** The team's skills and hooks, what each member decided about them, and what workstations reported. */
export interface DeliveryState extends OrgsState {
  /** The demo organization's members: a decision names one of them. */
  members: Member[];
  /** Every skill, team and personal. */
  skills: SkillEntry[];
  /** By skill name, newest first. */
  skillVersions: Record<string, SkillVersion[]>;
  /** By skill name. */
  skillAssignments: Record<string, Assignment[]>;
  /** What each member's workstations reported, by member id. */
  skillInstallations: Record<string, SkillInstallation[]>;
  hooks: HookEntry[];
  /** By hook name, newest first. */
  hookVersions: Record<string, HookVersion[]>;
  /** By hook name. */
  hookAssignments: Record<string, Assignment[]>;
  /** The files of each hook version, by `name@version`. */
  hookFiles: Record<string, ArtifactFileContent[]>;
}

/** The demo person, whom every call that names no member acts as. */
const CALLER = MEMBER_IDS.maya;

/** What a skill and a hook have in common: a pin, an audience, a decision per member. */
interface Entry {
  name: string;
  pinnedVersion?: string | null;
  allMembers: boolean;
  updatedAt: string;
  retired?: boolean;
  ownerId?: string | null;
}
interface Version {
  version: string;
  digest: string;
  sizeBytes: number;
  fileCount: number;
  pinned: boolean;
  retired?: boolean;
}

/** One kind of delivered thing, read from the state: the same rules serve skills and hooks. */
interface Lane<E extends Entry, V extends Version = Version> {
  /** In the words of the server's refusals: `skill_personal`, `hook_retired`. */
  readonly kind: 'skill' | 'hook';
  readonly entries: () => E[];
  readonly versions: () => Record<string, V[]>;
  readonly assignments: () => Record<string, Assignment[]>;
}

export function createDeliveryHandlers(
  state: () => DeliveryState,
  organizationOf: (request: Request) => Organization,
  now: () => Date,
): HttpHandler[] {
  const inDemoOrg = (request: Request): boolean => organizationOf(request).id === state().organization.id;
  const manages = (request: Request): boolean =>
    managesMembers(
      orgRoleOf(
        state().orgMembers[organizationOf(request).id]?.find((member) => member.login === DEMO_LOGIN)?.role,
      ),
    );
  /** An owner's or an admin's call: the server lets nobody else through. */
  const administrators = (request: Request): Response | undefined =>
    manages(request)
      ? undefined
      : refusal(403, 'forbidden', 'Only an owner or an admin manages the catalog.');

  const skills: Lane<SkillEntry, SkillVersion> = {
    kind: 'skill',
    entries: () => state().skills,
    versions: () => state().skillVersions,
    assignments: () => state().skillAssignments,
  };
  const hooks: Lane<HookEntry, HookVersion> = {
    kind: 'hook',
    entries: () => state().hooks,
    versions: () => state().hookVersions,
    assignments: () => state().hookAssignments,
  };

  const notFound = (what: string): Response => refusal(404, 'not_found', `${what} not found`);
  const entryOf = <E extends Entry>(lane: Lane<E>, request: Request, name: string): E | undefined =>
    inDemoOrg(request) ? lane.entries().find((entry) => entry.name === name) : undefined;
  const versionsOf = <E extends Entry, V extends Version>(lane: Lane<E, V>, name: string): V[] =>
    lane.versions()[name] ?? [];
  const personal = (lane: { readonly kind: string }): Response =>
    refusal(409, `${lane.kind}_personal`, 'A member’s personal skill: promote it first.');
  const touch = (entry: Entry): void => {
    entry.updatedAt = now().toISOString();
  };
  /** The pinned flag of every version follows the entry's pin. */
  const follow = (entry: Entry, versions: Version[]): void => {
    for (const version of versions) version.pinned = version.version === entry.pinnedVersion;
  };
  const setPin = <E extends Entry>(lane: Lane<E>, entry: E, version: string | null): void => {
    entry.pinnedVersion = version;
    follow(entry, versionsOf(lane, entry.name));
    touch(entry);
  };

  /** A write on a team entry: an administrator's, on an entry that exists and is not a member's own skill. */
  const onTeamEntry = async <E extends Entry>(
    lane: Lane<E>,
    request: Request,
    name: string,
    then: (entry: E) => Response | Promise<Response>,
  ): Promise<Response> => {
    const refused = administrators(request);
    if (refused !== undefined) return refused;
    const entry = entryOf(lane, request, name);
    if (entry === undefined) return notFound(lane.kind);
    if (entry.ownerId !== undefined && entry.ownerId !== null) return personal(lane);
    return then(entry);
  };

  const pin = async <E extends Entry>(lane: Lane<E>, request: Request, name: string) =>
    onTeamEntry(lane, request, name, async (entry) => {
      const body = zPinSkillRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'A version is expected.');
      const version = versionsOf(lane, name).find((item) => item.version === body.data.version);
      if (version === undefined) return notFound('version');
      if (entry.retired === true) return refusal(409, `${lane.kind}_retired`, 'The skill is retired.');
      if (version.retired === true)
        return refusal(409, `${lane.kind}_version_retired`, 'The version is retired.');
      setPin(lane, entry, version.version);
      return HttpResponse.json(entry);
    });
  const unpin = async <E extends Entry>(lane: Lane<E>, request: Request, name: string) =>
    onTeamEntry(lane, request, name, (entry) => {
      setPin(lane, entry, null);
      return HttpResponse.json(entry);
    });
  const audience = async <E extends Entry>(lane: Lane<E>, request: Request, name: string) =>
    onTeamEntry(lane, request, name, async (entry) => {
      const body = zSetAudienceRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'allMembers is expected.');
      entry.allMembers = body.data.allMembers;
      touch(entry);
      return HttpResponse.json(entry);
    });
  const assignments = async <E extends Entry>(lane: Lane<E>, request: Request, name: string) =>
    onTeamEntry(lane, request, name, () => HttpResponse.json({ items: lane.assignments()[name] ?? [] }));
  const assign = async <E extends Entry>(lane: Lane<E>, request: Request, name: string, memberId: string) =>
    onTeamEntry(lane, request, name, async () => {
      const body = zSetAssignmentRequest.safeParse(await readJson(request));
      if (!body.success || (body.data.decision !== 'allow' && body.data.decision !== 'deny'))
        return refusal(400, 'invalid_request', 'allow or deny is expected.');
      if (!state().members.some((member) => member.id === memberId)) return notFound('member');
      const decision: Assignment = { memberId, decision: body.data.decision, updatedAt: now().toISOString() };
      const others = (lane.assignments()[name] ?? []).filter((item) => item.memberId !== memberId);
      lane.assignments()[name] = [...others, decision];
      return HttpResponse.json(decision);
    });
  const clear = async <E extends Entry>(lane: Lane<E>, request: Request, name: string, memberId: string) =>
    onTeamEntry(lane, request, name, () => {
      lane.assignments()[name] = (lane.assignments()[name] ?? []).filter(
        (item) => item.memberId !== memberId,
      );
      return new HttpResponse(null, { status: 204 });
    });

  /** The pinned version a member receives, if any: decisions first, then the audience; a personal skill, its owner. */
  const receives = <E extends Entry, V extends Version>(
    lane: Lane<E, V>,
    entry: E,
    memberId: string,
  ): V | undefined => {
    if (entry.retired === true || entry.pinnedVersion === undefined || entry.pinnedVersion === null)
      return undefined;
    const version = versionsOf(lane, entry.name).find((item) => item.version === entry.pinnedVersion);
    if (version === undefined || version.retired === true) return undefined;
    if (entry.ownerId !== undefined && entry.ownerId !== null)
      return entry.ownerId === memberId ? version : undefined;
    const decision = (lane.assignments()[entry.name] ?? []).find(
      (item) => item.memberId === memberId,
    )?.decision;
    if (decision === 'deny') return undefined;
    return decision === 'allow' || entry.allMembers ? version : undefined;
  };
  const effectiveSkills = (memberId: string): EffectiveSkill[] =>
    state()
      .skills.flatMap((skill) => {
        const version = receives(skills, skill, memberId);
        return version === undefined
          ? []
          : [
              {
                name: skill.name,
                version: version.version,
                digest: version.digest,
                sizeBytes: version.sizeBytes,
                fileCount: version.fileCount,
              },
            ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  const effectiveHooks = (memberId: string): EffectiveHook[] =>
    state()
      .hooks.flatMap((hook) => {
        const version = receives(hooks, hook, memberId);
        return version === undefined
          ? []
          : [
              {
                name: hook.name,
                version: version.version,
                digest: version.digest,
                definition: version.definition,
                sizeBytes: version.sizeBytes,
                fileCount: version.fileCount,
              },
            ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  /** A member's delivered view: the member themself or an administrator; 404 for someone outside the organization. */
  const memberView = (
    request: Request,
    memberId: string,
    administratorsOnly: boolean,
  ): Response | undefined => {
    if (memberId !== CALLER || administratorsOnly) {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
    }
    return inDemoOrg(request) && state().members.some((member) => member.id === memberId)
      ? undefined
      : notFound('member');
  };

  /** The caller's personal skills: their own, as the member themself (never an administrator's view of others'). */
  const mine = (request: Request, name: string): SkillEntry | Response => {
    const skill = state().skills.find((item) => item.name === name && item.ownerId === CALLER);
    return skill === undefined || !inDemoOrg(request) ? notFound('skill') : skill;
  };
  const onMine = async (
    request: Request,
    name: string,
    then: (skill: SkillEntry) => Response | Promise<Response>,
  ): Promise<Response> => {
    const skill = mine(request, name);
    return skill instanceof Response ? skill : then(skill);
  };

  return [
    // The catalog of skills, team and personal.
    handleListSkills(({ request }) => {
      const refused = administrators(request);
      return refused ?? HttpResponse.json({ items: inDemoOrg(request) ? state().skills : [] });
    }),
    handleListSkillVersions(({ request, params }) => {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
      const skill = entryOf(skills, request, params.name);
      return skill === undefined
        ? notFound('skill')
        : HttpResponse.json({ skill, versions: versionsOf(skills, params.name) });
    }),
    handlePinSkill(async ({ request, params }) => pin(skills, request, params.name)),
    handleUnpinSkill(async ({ request, params }) => unpin(skills, request, params.name)),
    handleSetSkillAudience(async ({ request, params }) => audience(skills, request, params.name)),
    handleListSkillAssignments(async ({ request, params }) => assignments(skills, request, params.name)),
    handleSetSkillAssignment(async ({ request, params }) =>
      assign(skills, request, params.name, params.memberId),
    ),
    handleClearSkillAssignment(async ({ request, params }) =>
      clear(skills, request, params.name, params.memberId),
    ),
    handleRetireSkill(({ request, params }) => {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
      const skill = entryOf(skills, request, params.name);
      if (skill === undefined) return notFound('skill');
      skill.retired = true;
      setPin(skills, skill, null);
      return HttpResponse.json(skill);
    }),
    handleRestoreSkill(({ request, params }) => {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
      const skill = entryOf(skills, request, params.name);
      if (skill === undefined) return notFound('skill');
      skill.retired = false;
      touch(skill);
      return HttpResponse.json(skill);
    }),
    handleRetireSkillVersion(async ({ request, params }) =>
      onTeamEntry(skills, request, params.name, (skill) => {
        const version = versionsOf(skills, params.name).find((item) => item.version === params.version);
        if (version === undefined) return notFound('version');
        if (version.pinned) return refusal(409, 'skill_version_pinned', 'Pin another version first.');
        version.retired = true;
        touch(skill);
        return HttpResponse.json(version);
      }),
    ),
    handlePromoteSkill(({ request, params }) => {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
      const skill = entryOf(skills, request, params.name);
      if (skill === undefined) return notFound('skill');
      if (skill.ownerId === undefined || skill.ownerId === null)
        return refusal(409, 'skill_not_personal', 'A team skill is already the team’s.');
      delete skill.ownerId;
      skill.allMembers = false;
      setPin(skills, skill, null);
      return HttpResponse.json(skill);
    }),

    // A member's own skills.
    handleListMySkills(({ request }) =>
      HttpResponse.json({
        items: inDemoOrg(request) ? state().skills.filter((skill) => skill.ownerId === CALLER) : [],
      }),
    ),
    handleListMySkillVersions(async ({ request, params }) =>
      onMine(request, params.name, (skill) =>
        HttpResponse.json({ skill, versions: versionsOf(skills, params.name) }),
      ),
    ),
    handlePinMySkill(async ({ request, params }) =>
      onMine(request, params.name, async (skill) => {
        const body = zPinSkillRequest.safeParse(await readJson(request));
        if (!body.success) return refusal(400, 'invalid_request', 'A version is expected.');
        const version = versionsOf(skills, params.name).find((item) => item.version === body.data.version);
        if (version === undefined) return notFound('version');
        if (skill.retired) return refusal(409, 'skill_retired', 'The skill is retired.');
        if (version.retired) return refusal(409, 'skill_version_retired', 'The version is retired.');
        setPin(skills, skill, version.version);
        return HttpResponse.json(skill);
      }),
    ),
    handleUnpinMySkill(async ({ request, params }) =>
      onMine(request, params.name, (skill) => {
        setPin(skills, skill, null);
        return HttpResponse.json(skill);
      }),
    ),
    handleRetireMySkill(async ({ request, params }) =>
      onMine(request, params.name, (skill) => {
        skill.retired = true;
        setPin(skills, skill, null);
        return HttpResponse.json(skill);
      }),
    ),
    handleRestoreMySkill(async ({ request, params }) =>
      onMine(request, params.name, (skill) => {
        skill.retired = false;
        touch(skill);
        return HttpResponse.json(skill);
      }),
    ),

    // What a member receives, and where it is installed.
    handleGetSkillDelivery(() => HttpResponse.json({ memberId: CALLER, skills: effectiveSkills(CALLER) })),
    handleGetMemberSkillDelivery(({ request, params }) => {
      const refused = memberView(request, params.memberId, false);
      return (
        refused ?? HttpResponse.json({ memberId: params.memberId, skills: effectiveSkills(params.memberId) })
      );
    }),
    handleListMySkillInstallations(() =>
      HttpResponse.json({ items: state().skillInstallations[CALLER] ?? [] }),
    ),
    handleListMemberSkillInstallations(({ request, params }) => {
      const refused = memberView(request, params.memberId, true);
      return refused ?? HttpResponse.json({ items: state().skillInstallations[params.memberId] ?? [] });
    }),

    // The team hooks.
    handleListHooks(({ request }) => {
      const refused = administrators(request);
      return refused ?? HttpResponse.json({ items: inDemoOrg(request) ? state().hooks : [] });
    }),
    handleListHookVersions(({ request, params }) => {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
      const hook = entryOf(hooks, request, params.name);
      return hook === undefined
        ? notFound('hook')
        : HttpResponse.json({ hook, versions: versionsOf(hooks, params.name) });
    }),
    handleReadHookVersion(({ request, params }) => {
      const refused = administrators(request);
      if (refused !== undefined) return refused;
      const hook = entryOf(hooks, request, params.name);
      const version =
        hook === undefined
          ? undefined
          : versionsOf(hooks, params.name).find((item) => item.version === params.version);
      if (version === undefined) return notFound('hook version');
      return HttpResponse.json({
        name: params.name,
        version: version.version,
        digest: version.digest,
        definition: version.definition,
        files: state().hookFiles[`${params.name}@${params.version}`] ?? [],
      });
    }),
    handlePinHook(async ({ request, params }) => pin(hooks, request, params.name)),
    handleUnpinHook(async ({ request, params }) => unpin(hooks, request, params.name)),
    handleSetHookAudience(async ({ request, params }) => audience(hooks, request, params.name)),
    handleListHookAssignments(async ({ request, params }) => assignments(hooks, request, params.name)),
    handleSetHookAssignment(async ({ request, params }) =>
      assign(hooks, request, params.name, params.memberId),
    ),
    handleClearHookAssignment(async ({ request, params }) =>
      clear(hooks, request, params.name, params.memberId),
    ),
    handleGetHookDelivery(() => HttpResponse.json({ memberId: CALLER, hooks: effectiveHooks(CALLER) })),
    handleGetMemberHookDelivery(({ request, params }) => {
      const refused = memberView(request, params.memberId, true);
      return (
        refused ?? HttpResponse.json({ memberId: params.memberId, hooks: effectiveHooks(params.memberId) })
      );
    }),
  ];
}
