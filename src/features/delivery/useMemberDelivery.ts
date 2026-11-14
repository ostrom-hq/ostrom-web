// SPDX-License-Identifier: Apache-2.0
import {
  getHookDeliveryOptions,
  getMemberHookDeliveryOptions,
  getMemberSkillDeliveryOptions,
  getSkillDeliveryOptions,
  listMemberSkillInstallationsOptions,
  listMySkillInstallationsOptions,
} from '@gen/api/@tanstack/react-query.gen';
import type { EffectiveHook, EffectiveSkill, OrgMember, SkillInstallation } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';

/** Whom the delivered view is of, as the person reading it needs to hear it. */
export interface DeliveredMember {
  /** The viewer's own view: read as the member themself, with what any member may read. */
  readonly mine: boolean;
  /** The member, when the members are readable; absent for a member who left or when they are not readable. */
  readonly member: OrgMember | undefined;
  /** Owners and admins also read a member's installations and reach the catalog. */
  readonly canManage: boolean;
}

export interface SkillDeliveryViewModel {
  readonly who: DeliveredMember | undefined;
  /** The pinned versions the member is allowed to install, sorted by name. */
  readonly skills: readonly EffectiveSkill[] | undefined;
  /** What each workstation last reported, newest first. */
  readonly installations: readonly SkillInstallation[] | undefined;
  readonly failure: Error | undefined;
}

/**
 * The skills a member receives and where they are installed. The viewer's own view asks as the member themself, which
 * any member may; another member's view is an administrator's, and the server refuses anyone else.
 */
export function useSkillDelivery(memberId: string): SkillDeliveryViewModel {
  const viewer = useViewer();
  const members = useCurrentOrgMembers();
  // Until the viewer is known, nothing is asked: a member's own view would otherwise be asked as an administrator's.
  const known = viewer.memberId !== undefined;
  const mine = viewer.memberId === memberId;
  const own = known && mine;
  const other = known && !mine;
  const ownDelivery = useQuery(ready(getSkillDeliveryOptions(), { enabled: own }));
  const otherDelivery = useQuery(
    ready(getMemberSkillDeliveryOptions({ path: { memberId } }), { enabled: other }),
  );
  const ownInstallations = useQuery(ready(listMySkillInstallationsOptions(), { enabled: own }));
  const otherInstallations = useQuery(
    ready(listMemberSkillInstallationsOptions({ path: { memberId } }), { enabled: other }),
  );
  const delivery = own ? ownDelivery : otherDelivery;
  const installations = own ? ownInstallations : otherInstallations;
  return {
    who: known
      ? {
          mine,
          member: members.members?.find((member) => member.id === memberId),
          canManage: viewer.canManage,
        }
      : undefined,
    skills: delivery.data?.skills,
    installations: installations.data?.items,
    failure: failureOf(delivery.error ?? installations.error),
  };
}

export interface HookDeliveryViewModel {
  readonly who: DeliveredMember | undefined;
  /** The pinned versions the member is allowed to install, sorted by name. */
  readonly hooks: readonly EffectiveHook[] | undefined;
  readonly failure: Error | undefined;
}

/** The hooks a member receives; asked as for skills. */
export function useHookDelivery(memberId: string): HookDeliveryViewModel {
  const viewer = useViewer();
  const members = useCurrentOrgMembers();
  const known = viewer.memberId !== undefined;
  const mine = viewer.memberId === memberId;
  const ownDelivery = useQuery(ready(getHookDeliveryOptions(), { enabled: known && mine }));
  const otherDelivery = useQuery(
    ready(getMemberHookDeliveryOptions({ path: { memberId } }), { enabled: known && !mine }),
  );
  const delivery = mine ? ownDelivery : otherDelivery;
  return {
    who: known
      ? {
          mine,
          member: members.members?.find((member) => member.id === memberId),
          canManage: viewer.canManage,
        }
      : undefined,
    hooks: delivery.data?.hooks,
    failure: failureOf(delivery.error),
  };
}
