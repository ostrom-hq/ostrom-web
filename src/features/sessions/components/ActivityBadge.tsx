// SPDX-License-Identifier: Apache-2.0
import type { Session } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { type SessionActivity, sessionActivity } from '../model';

const TONES: Readonly<Record<SessionActivity, BadgeTone>> = {
  working: 'signal',
  waiting: 'warning',
};

/** Whether the agent works or waits for a person, and since when; nothing when it said nothing. */
export function ActivityBadge({
  session,
  now,
}: {
  readonly session: Session;
  readonly now: Date;
}): ReactElement | null {
  const { t, i18n } = useTranslation();
  const activity = sessionActivity(session);
  if (activity === undefined) return null;
  const since = session.activitySince;
  return (
    <span title={since === undefined ? undefined : formatRelative(since, now, i18n.language)}>
      <Badge tone={TONES[activity]}>{t(`sessions.activity.${activity}`)}</Badge>
    </span>
  );
}
