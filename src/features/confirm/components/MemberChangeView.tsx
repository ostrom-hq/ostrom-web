// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { orgRoleOf } from '@/shared/org/roles';
import { type Fact, Facts } from '@/shared/ui/Screen';
import type { MemberChange } from '../model';

/** A change of the organization's people in words: who, which role, which address; never JSON to read. */
export function MemberChangeView({ change }: { readonly change: MemberChange }): ReactElement {
  const { t } = useTranslation();
  // A role this console does not know yet is shown as the server wrote it.
  const role = (name: string): string => {
    const known = orgRoleOf(name);
    return known === undefined ? name : t(`members.role.${known}`);
  };
  if (change.kind === 'invite') {
    return (
      <section className="o-card ys-section" aria-labelledby="cf-member">
        <h2 id="cf-member" className="ys-label">
          {t('confirm.member.title.invite')}
        </h2>
        {/* An address can be long and come twice with two roles: a list, not label and value pairs. */}
        <ul className="o-invitees">
          {change.invites.map((invite) => (
            <li key={`${invite.email} ${invite.role}`}>
              <span className="o-invitees__email">{invite.email}</span>
              <span className="o-invitees__role">{role(invite.role)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  let facts: readonly Fact[];
  switch (change.kind) {
    case 'role':
      facts = [
        { label: t('confirm.member.person'), value: change.login },
        {
          label: t('confirm.member.role'),
          value: t('confirm.member.roleChange', { from: role(change.from), to: role(change.to) }),
        },
      ];
      break;
    case 'remove':
      facts = [
        { label: t('confirm.member.person'), value: change.login },
        {
          label: t('confirm.member.role'),
          value: t('confirm.member.leaves', { role: role(change.role) }),
        },
      ];
      break;
    case 'link':
      facts = [
        { label: t('confirm.member.joinsAs'), value: role(change.role) },
        { label: t('confirm.member.uses'), value: String(change.maxUses) },
      ];
      break;
  }
  return (
    <section className="o-card ys-section" aria-labelledby="cf-member">
      <h2 id="cf-member" className="ys-label">
        {t(`confirm.member.title.${change.kind}`)}
      </h2>
      <Facts facts={facts} />
    </section>
  );
}
