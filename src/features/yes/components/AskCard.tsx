// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute, formatRelative } from '@/shared/lib/time';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { agentLabel, askTone, diffStats, shortSha } from '../model';

export interface AskCardProps {
  readonly ask: Ask;
  readonly fresh: boolean;
  readonly now: Date;
}

export function AskCard({ ask, fresh, now }: AskCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const mine = askTone(ask) === 'waiting-other';
  const stats = ask.diff === undefined ? undefined : diffStats(ask.diff);
  const when =
    ask.requestedAt === undefined
      ? undefined
      : {
          relative: formatRelative(ask.requestedAt, now, i18n.language),
          absolute: formatAbsolute(ask.requestedAt, i18n.language),
        };
  return (
    <Link
      to="/yes/$askId"
      params={{ askId: ask.id }}
      className={fresh ? 'ys-card o-card ys-card--fresh' : 'ys-card o-card'}
    >
      <span className="ys-row">
        <Avatar login={ask.who.dev} />
        <span className="ys-col ys-grow">
          <span className="ys-ellipsis">
            <b>{ask.who.dev ?? t('yes.someone')}</b>{' '}
            {t('yes.via', { agent: agentLabel(ask.who.agent) ?? t('yes.anAgent') })}
          </span>
          <span className="ys-meta ys-ellipsis">
            {when === undefined ? null : (
              <time dateTime={ask.requestedAt} title={when.absolute}>
                {when.relative}
              </time>
            )}
            {when !== undefined && ask.what.repo !== undefined ? ' · ' : null}
            {ask.what.repo}
          </span>
        </span>
        {mine ? (
          <Badge tone="warning">{t('yes.badge.mine')}</Badge>
        ) : fresh ? (
          <Badge tone="signal">{t('yes.badge.new')}</Badge>
        ) : (
          <Badge tone="warning">{t('yes.tone.waiting-you')}</Badge>
        )}
      </span>
      <span className="ys-action">{ask.what.action ?? ask.title}</span>
      {ask.what.command === undefined ? null : <code className="ys-cmd">{ask.what.command}</code>}
      <span className="ys-row ys-wrap ys-small">
        {ask.gate === undefined ? null : <Chip label={t('yes.chip.rule')} value={ask.gate.label} />}
        {ask.rules.length === 0 ? null : (
          <Chip label={t('yes.chip.rules')} value={String(ask.rules.length)} />
        )}
        {stats === undefined ? null : (
          <Chip label={t('yes.chip.diff')} value={`+${String(stats.added)} −${String(stats.removed)}`} />
        )}
        {ask.pr === undefined ? null : (
          <Chip label={t('yes.chip.pr')} value={`#${ask.pr.number} @ ${shortSha(ask.pr.sha)}`} />
        )}
      </span>
    </Link>
  );
}

interface ChipProps {
  readonly label: string;
  readonly value: string;
}

function Chip({ label, value }: ChipProps): ReactElement {
  return (
    <span className="ys-chip">
      <span className="ys-chip__k">{label}</span>
      {value}
    </span>
  );
}
