// SPDX-License-Identifier: Apache-2.0
import type { Approval } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { approvalTone, shortSha } from '../model';

export interface ApprovalCardProps {
  readonly approval: Approval;
  readonly viewer: string | undefined;
  readonly fresh: boolean;
  /** A yes waits for the person's GitHub link. */
  readonly linkRequired: boolean;
}

/** A row only opens the request: nobody approves from a list. */
export function ApprovalCard({ approval, viewer, fresh, linkRequired }: ApprovalCardProps): ReactElement {
  const { t } = useTranslation();
  const asker = approval.askedBy?.[0];
  const sha = approval.sha ?? undefined;
  const commits = approval.commits?.length ?? 0;
  return (
    <Link
      to="/yes/$approvalId"
      params={{ approvalId: approval.id }}
      className={fresh ? 'ys-card o-card ys-card--fresh' : 'ys-card o-card'}
    >
      <span className="ys-row">
        <Avatar login={asker} />
        <span className="ys-col ys-grow">
          <span className="ys-ellipsis">{t('yes.asks', { who: asker ?? t('yes.someone') })}</span>
          <span className="ys-meta ys-ellipsis">
            {[approval.repo ?? undefined, sha === undefined ? undefined : shortSha(sha)]
              .filter((part) => part !== undefined)
              .join(' · ')}
          </span>
        </span>
        {approvalTone(approval, viewer) === 'asked-by-you' ? (
          <Badge tone="warning">{t('yes.badge.mine')}</Badge>
        ) : linkRequired ? (
          <Badge tone="warning">{t('yes.githubLink.badge')}</Badge>
        ) : fresh ? (
          <Badge tone="signal">{t('yes.badge.new')}</Badge>
        ) : (
          <Badge tone="signal" approval="waiting">
            {t('yes.tone.waiting-you')}
          </Badge>
        )}
      </span>
      <span className="ys-action">{approval.title}</span>
      <span className="ys-row ys-wrap ys-small">
        {commits === 0 ? null : <Chip value={t('yes.chip.commits', { count: commits })} />}
      </span>
    </Link>
  );
}

function Chip({ value }: { readonly value: string }): ReactElement {
  return <span className="ys-chip">{value}</span>;
}
