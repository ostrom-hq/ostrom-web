// SPDX-License-Identifier: Apache-2.0

/**
 * A person's role in an organization, as `/api/v1/orgs/{org}/…` writes it (`OrgRole` of ostrom-server, lowercase).
 * The contract types it as a string: anything else reads as no role, and gives no right.
 */
export const ORG_ROLES = ['owner', 'admin', 'approver', 'member', 'billing'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export function orgRoleOf(value: string | undefined): OrgRole | undefined {
  return ORG_ROLES.find((role) => role === value);
}

/** Owners and admins invite, change roles and remove people (`MANAGER_ROLES` of the server). */
export function managesMembers(role: OrgRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Owners, admins and the billing role buy, switch, cancel and read invoices (`BILLING_ADMIN_ROLES`). */
export function managesBilling(role: OrgRole | undefined): boolean {
  return managesMembers(role) || role === 'billing';
}

/**
 * The server's `canManage`: nobody manages the owner (ownership moves by transfer), only the owner manages
 * admins, owners and admins manage everyone else.
 */
export function mayManage(caller: OrgRole | undefined, target: OrgRole): boolean {
  if (target === 'owner') return false;
  if (target === 'admin') return caller === 'owner';
  return managesMembers(caller);
}

/** The roles the caller can give, by invitation or by a change: never owner, admin only from the owner. */
export function givableRoles(caller: OrgRole | undefined): readonly OrgRole[] {
  return ORG_ROLES.filter((role) => role !== 'owner' && mayManage(caller, role));
}
