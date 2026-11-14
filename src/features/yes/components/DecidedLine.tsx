// SPDX-License-Identifier: Apache-2.0
import type { Approval } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { knownOr, type Known } from '@/shared/lib/openEnum';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { formatRelative } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';

export interface DecidedLineProps {
  readonly approval: Approval;
  readonly now: Date;
}

const TONES: Readonly<Record<Known<Approval['status']>, BadgeTone>> = {
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
  const enumText = useEnumLabel();
  const when =
    approval.decidedAt === undefined ? undefined : formatRelative(approval.decidedAt, now, i18n.language);
  return (
    <Link to="/yes/$approvalId" params={{ approvalId: approval.id }} className="ys-line">
      <Badge tone={knownOr(TONES, approval.status, 'neutral')}>
        {enumText('yes.tone', knownOr(LABELS, approval.status, approval.status))}
      </Badge>
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
