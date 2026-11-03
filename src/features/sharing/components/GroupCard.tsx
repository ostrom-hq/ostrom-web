// SPDX-License-Identifier: AGPL-3.0-only
import type { Group, SharedAccount } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { lentAccounts } from '../groups';

export interface GroupCardProps {
  readonly group: Group;
  /** The subscriptions the person reads; one they do not is left out of the list. */
  readonly accounts: readonly SharedAccount[];
}

/** A group in the list: its name leads to it, then how many people, what it lends, and who is paused now. */
export function GroupCard({ group, accounts }: GroupCardProps): ReactElement {
  const { t } = useTranslation();
  const headingId = useId();
  const lent = lentAccounts(group.accounts, accounts).map((account) => account.label);
  const hidden = group.accounts.length - lent.length;
  const paused = group.paused?.length ?? 0;
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline sh-head">
        <h3 id={headingId} className="sh-name">
          <Link to="/accounts/groups/$groupId" params={{ groupId: group.id }}>
            {group.name}
          </Link>
        </h3>
        {paused === 0 ? null : (
          <Badge tone="warning">{t('sharing.groups.pausedCount', { count: paused })}</Badge>
        )}
      </div>
      <p className="o-row__meta">{t('sharing.groups.memberCount', { count: group.members.length })}</p>
      <p className="o-row__meta">
        {lent.length > 0
          ? t('sharing.groups.lends', { list: lent.join(', ') })
          : hidden > 0
            ? t('sharing.groups.lendsHidden', { count: hidden })
            : t('sharing.groups.lendsNothing')}
      </p>
    </article>
  );
}
