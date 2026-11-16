// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { hostNotice, hostOffline, hostRefused, isRemote, waitingForHost } from '@/features/cloudHost';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import {
  blockedDeletionOf,
  isCloudAgent,
  isCloudStatus,
  sessionTitle,
  sessionTone,
  terminatedReasonOf,
} from '../model';
import { preparationAdvice, preparationOf } from '../recipe';
import { whereOf } from '../deviceWords';

/**
 * A cloud session as the row reads it: `automationId` (TeamCode's, the automation that started it) is not in the
 * server's document yet; the badge shows once the server sends it.
 */
export type CloudSessionRow = CloudSessionResponse & { readonly automationId?: string | null };

export interface SessionRowProps {
  readonly session: CloudSessionRow;
  readonly now: Date;
  readonly busy: boolean;
  /** The name of the profile the session runs on, when the profiles are known. */
  readonly profileName?: string | undefined;
  /** Present when the viewer may stop this session and it still runs. */
  readonly onStop: (() => void) | undefined;
}

export function SessionRow({ session, now, busy, profileName, onStop }: SessionRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const title = sessionTitle(session);
  const phase = preparationOf(session);
  const advice = preparationAdvice(session);
  const reason = terminatedReasonOf(session);
  const blocked = blockedDeletionOf(session);
  const conversation = useAnnounced('runners.cloud.conversation.v1') && session.mode === 'conversation';
  // Where it runs shows once the server has remote sessions (TeamCode's companion `KindChips`).
  const kinds = useAnnounced('runners.cloud.remote.v1');
  const remote = isRemote(session);
  // A remote session's failure is its device's: offline or refused, worded (TeamCode's banners).
  const notice = session.failure && remote ? hostNotice(t, session) : undefined;
  return (
    <div className="o-row cl-session">
      <span className="o-row__main">
        {conversation ? (
          // A conversation has its own screen; a terminal session is followed from where it runs.
          <Link to="/cloud/sessions/$sessionId" params={{ sessionId: session.id }} className="o-row__title">
            {title}
          </Link>
        ) : (
          <span className="o-row__title">{title}</span>
        )}
        <span className="o-row__meta">
          {[
            session.owner,
            isCloudAgent(session.agent) ? t(`cloud.agent.${session.agent}`) : session.agent,
            session.model,
            // A remote session runs in a folder of its device, never on a profile or an image.
            remote ? session.host?.directoryName : undefined,
            !remote && session.profile
              ? t('cloud.session.profile', {
                  name: profileName ?? session.profile.id,
                  version: session.profile.version,
                })
              : undefined,
            remote ? undefined : session.image,
            phase === undefined ? undefined : t(`cloud.phase.${phase}`),
            t('cloud.session.started', { when: formatRelative(session.createdAt, now, i18n.language) }),
            typeof session.automationId === 'string' ? t('cloud.session.byAutomation') : undefined,
            typeof session.endedAt === 'string'
              ? t('cloud.session.ended', { when: formatRelative(session.endedAt, now, i18n.language) })
              : undefined,
            session.status === 'paused' && typeof session.expiresAt === 'string'
              ? t('cloud.session.expires', { when: formatRelative(session.expiresAt, now, i18n.language) })
              : undefined,
            session.status !== 'terminated' || reason === undefined
              ? undefined
              : t(`cloud.session.terminated.${reason}`),
          ]
            .filter((part) => typeof part === 'string')
            .join(' · ')}
        </span>
        {notice !== undefined ? (
          <span className="cl-session__failure">{notice.text}</span>
        ) : session.failure ? (
          <span className="cl-session__failure">
            {[session.failure.message, advice === undefined ? undefined : t(`cloud.preparation.${advice}`)]
              .filter((part) => part !== undefined)
              .join(' ')}
          </span>
        ) : null}
        {blocked === undefined ? null : (
          <span className="cl-session__failure">
            {t('cloud.session.deletionBlocked', {
              why:
                blocked.code !== undefined
                  ? t(`cloud.session.deletionProblem.${blocked.code}`)
                  : blocked.message === ''
                    ? t('cloud.session.deletionUnknown')
                    : blocked.message,
            })}
          </span>
        )}
      </span>
      <span className="o-inline">
        {kinds ? <Badge>{whereOf(t, session)}</Badge> : null}
        {hostOffline(session) ? <Badge tone="warning">{t('cloud.remote.offlineChip')}</Badge> : null}
        {waitingForHost(session) ? <Badge>{t('cloud.remote.waitingChip')}</Badge> : null}
        {hostRefused(session) ? <Badge tone="danger">{t('cloud.remote.refusedChip')}</Badge> : null}
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
