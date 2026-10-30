// SPDX-License-Identifier: AGPL-3.0-only
import { givableRoles, managesBilling, managesMembers, mayManage, orgRoleOf } from './roles';

describe('organization roles', () => {
  it('reads the server’s roles and nothing else', () => {
    expect(orgRoleOf('billing')).toBe('billing');
    expect(orgRoleOf('King')).toBeUndefined();
    expect(orgRoleOf(undefined)).toBeUndefined();
  });

  it('lets owners and admins manage people, and the billing role manage billing too', () => {
    expect(
      ['owner', 'admin', 'approver', 'member', 'billing', undefined].map((role) =>
        managesMembers(orgRoleOf(role)),
      ),
    ).toEqual([true, true, false, false, false, false]);
    expect(managesBilling('billing')).toBe(true);
    expect(managesBilling('admin')).toBe(true);
    expect(managesBilling('member')).toBe(false);
  });

  it('follows the server: nobody manages the owner, only the owner manages admins', () => {
    expect(mayManage('owner', 'owner')).toBe(false);
    expect(mayManage('owner', 'admin')).toBe(true);
    expect(mayManage('admin', 'admin')).toBe(false);
    expect(mayManage('admin', 'member')).toBe(true);
    expect(mayManage('member', 'approver')).toBe(false);
    expect(givableRoles('owner')).toEqual(['admin', 'approver', 'member', 'billing']);
    expect(givableRoles('admin')).toEqual(['approver', 'member', 'billing']);
    expect(givableRoles('billing')).toEqual([]);
  });
});
