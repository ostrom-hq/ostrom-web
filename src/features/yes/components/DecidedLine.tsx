// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';

export interface DecidedLineProps {
  readonly approval: Approval;
  readonly now: Date;
}

const TONES: Readonly<Record<Approval['status'], BadgeTone>> = {
  pending: 'neutral',
  approved: 'success',
  rejected: 'danger',
  expired: 'neutral',
};

const LABELS = {
  pending: 'waiting-you',
  approved: 'approved',
  rejected: 'refused',
  expired: 'expired',
} as const;

export function DecidedLine({ approval, now }: DecidedLineProps): ReactElement {
  const { t, i18n } = useTranslation();
  const when =
    approval.decidedAt === undefined ? undefined : formatRelative(approval.decidedAt, now, i18n.language);
  return (
    <Link to="/yes/$approvalId" params={{ approvalId: approval.id }} className="ys-line">
      <Badge tone={TONES[approval.status]}>{t(`yes.tone.${LABELS[approval.status]}`)}</Badge>
      <span className="ys-line__title ys-ellipsis">
        {approval.selfApproved === true ? <Badge tone="warning">{t('yes.badge.selfApproved')}</Badge> : null}{' '}
        {approval.title}
      </span>
      <span className="ys-meta">
        {[approval.decidedBy, when].filter((part) => part !== undefined).join(' · ')}
      </span>
    </Link>
  );
}
