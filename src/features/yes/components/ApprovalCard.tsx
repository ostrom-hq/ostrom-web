// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute, formatRelative } from '@/shared/lib/time';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { approvalTone, checksSummary, shortSha } from '../model';

export interface ApprovalCardProps {
  readonly approval: Approval;
  readonly viewer: string | undefined;
  readonly fresh: boolean;
  readonly now: Date;
}

/** A row only opens the request: nobody approves from a list. */
export function ApprovalCard({ approval, viewer, fresh, now }: ApprovalCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const asker = approval.askedBy?.[0];
  const checks = checksSummary(approval.checks ?? []);
  const commits = approval.commitDetails?.length ?? approval.commits?.length ?? 0;
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
            {[approval.repo, approval.sha === undefined ? undefined : shortSha(approval.sha)]
              .filter((part) => part !== undefined)
              .join(' · ')}
          </span>
        </span>
        {approvalTone(approval, viewer) === 'asked-by-you' ? (
          <Badge tone="warning">{t('yes.badge.mine')}</Badge>
        ) : fresh ? (
          <Badge tone="signal">{t('yes.badge.new')}</Badge>
        ) : (
          <Badge tone="signal">{t('yes.tone.waiting-you')}</Badge>
        )}
      </span>
      <span className="ys-action">{approval.title}</span>
      <span className="ys-row ys-wrap ys-small">
        {commits === 0 ? null : <Chip value={t('yes.chip.commits', { count: commits })} />}
        {checks.total === 0 ? null : (
          <Chip
            value={t('yes.chip.checks', { passed: checks.passed, total: checks.total })}
            tone={checks.failed > 0 ? 'bad' : 'plain'}
          />
        )}
        {approval.expiresAt === undefined ? null : (
          <time
            className="ys-chip"
            dateTime={approval.expiresAt}
            title={formatAbsolute(approval.expiresAt, i18n.language)}
          >
            {t('yes.chip.expires', { when: formatRelative(approval.expiresAt, now, i18n.language) })}
          </time>
        )}
      </span>
    </Link>
  );
}

interface ChipProps {
  readonly value: string;
  readonly tone?: 'plain' | 'bad';
}

function Chip({ value, tone = 'plain' }: ChipProps): ReactElement {
  return <span className={tone === 'bad' ? 'ys-chip ys-chip--bad' : 'ys-chip'}>{value}</span>;
}
