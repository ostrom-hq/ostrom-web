// SPDX-License-Identifier: Apache-2.0
import type { SessionDto } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
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
  readonly session: SessionDto;
  readonly now: Date;
}): ReactElement | null {
  const { t, i18n } = useTranslation();
  const activity = sessionActivity(session);
  if (activity === undefined) return null;
  const since = session.activitySince;
  return (
    <span title={typeof since === 'string' ? formatRelative(since, now, i18n.language) : undefined}>
      <Badge tone={TONES[activity]}>{t(`sessions.activity.${activity}`)}</Badge>
    </span>
  );
}
