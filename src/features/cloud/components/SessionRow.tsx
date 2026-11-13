// SPDX-License-Identifier: Apache-2.0
import type { CloudSession } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { isCloudAgent, isCloudStatus, sessionTitle, sessionTone } from '../model';

export interface SessionRowProps {
  readonly session: CloudSession;
  readonly now: Date;
  readonly busy: boolean;
  /** Present when the viewer may stop this session and it still runs. */
  readonly onStop: (() => void) | undefined;
}

export function SessionRow({ session, now, busy, onStop }: SessionRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const title = sessionTitle(session);
  return (
    <div className="o-row cl-session">
      <span className="o-row__main">
        <span className="o-row__title">{title}</span>
        <span className="o-row__meta">
          {[
            session.owner,
            isCloudAgent(session.agent) ? t(`cloud.agent.${session.agent}`) : session.agent,
            session.model,
            session.automationId === undefined ? undefined : t('cloud.session.byAutomation'),
            t('cloud.session.started', { when: formatRelative(session.createdAt, now, i18n.language) }),
            session.endedAt === undefined
              ? undefined
              : t('cloud.session.ended', { when: formatRelative(session.endedAt, now, i18n.language) }),
          ]
            .filter((part) => part !== undefined)
            .join(' · ')}
        </span>
      </span>
      <span className="o-inline">
        <Badge tone={sessionTone(session.status)}>
          {isCloudStatus(session.status) ? t(`cloud.status.${session.status}`) : session.status}
        </Badge>
        {onStop === undefined ? null : (
          <ConfirmButton
            label={t('cloud.session.stop')}
            confirm={t('cloud.session.confirmStop', { what: title })}
            keep={t('cloud.session.keep')}
            disabled={busy}
            onConfirm={onStop}
          />
        )}
      </span>
    </div>
  );
}
