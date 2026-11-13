// SPDX-License-Identifier: Apache-2.0
import type { AuthSession } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';

export interface SessionRowProps {
  readonly session: AuthSession;
  /** One sign-out at a time: every row waits for the one on its way. */
  readonly locked: boolean;
  readonly onRevoke: () => void;
}

/** A signed-in session: where, since when, last seen when; this browser is said so. */
export function SessionRow({ session, locked, onRevoke }: SessionRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const when = (at: string): string =>
    new Date(at).toLocaleString(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const device = session.device ?? t('settings.sessions.unknownDevice');
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{device}</span>
        <span className="o-row__meta">
          {[
            t('settings.sessions.since', { date: when(session.createdAt) }),
            session.lastSeenAt === undefined
              ? undefined
              : t('settings.sessions.seen', { date: when(session.lastSeenAt) }),
          ]
            .filter((part) => part !== undefined)
            .join(' · ')}
        </span>
      </span>
      <span className="o-row__end o-inline">
        {session.current ? <Badge tone="success">{t('settings.sessions.current')}</Badge> : null}
        <ConfirmButton
          label={t('settings.sessions.revoke')}
          confirm={
            session.current
              ? t('settings.sessions.revokeCurrent')
              : t('settings.sessions.revokeConfirm', { device })
          }
          keep={t('settings.sessions.keep')}
          disabled={locked}
          onConfirm={onRevoke}
        />
      </span>
    </div>
  );
}
