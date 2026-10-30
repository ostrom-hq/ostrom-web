// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';

export interface DecidedLineProps {
  readonly ask: Ask;
  readonly now: Date;
}

export function DecidedLine({ ask, now }: DecidedLineProps): ReactElement {
  const { t, i18n } = useTranslation();
  const approved = ask.status === 'approved';
  const when = ask.decidedAt === undefined ? undefined : formatRelative(ask.decidedAt, now, i18n.language);
  return (
    <Link to="/yes/$askId" params={{ askId: ask.id }} className="ys-line">
      <Badge tone={approved ? 'success' : 'danger'}>
        {approved ? t('yes.badge.yes') : t('yes.badge.no')}
      </Badge>
      <span className="ys-line__title ys-ellipsis">
        {ask.selfApproved === true ? <Badge tone="warning">{t('yes.badge.selfApproved')}</Badge> : null}{' '}
        {ask.what.action ?? ask.title}
      </span>
      <span className="ys-meta">
        {[ask.decidedBy, when].filter((part) => part !== undefined).join(' · ')}
      </span>
    </Link>
  );
}
