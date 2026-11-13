// SPDX-License-Identifier: Apache-2.0
import type { OrgMember } from '@gen/api/types.gen';

/** Whether a person is found by what was typed: their login, name or email, whatever the case. */
export function isFound(member: Pick<OrgMember, 'login' | 'name' | 'email'>, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  return [member.login, member.name, member.email ?? ''].some((part) => part.toLowerCase().includes(wanted));
}
