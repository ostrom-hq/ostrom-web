// SPDX-License-Identifier: AGPL-3.0-only
import type { Wait } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { isViewer } from '../model';
import type { PeopleViewModel } from '../useWaits';

/** Open and asked of the viewer is the one "a human is awaited" state (garnet); the rest is quiet. */
export function StatusBadge({
  wait,
  people,
}: {
  readonly wait: Wait;
  readonly people: PeopleViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const label = t(`waits.status.${wait.status}`);
  if (wait.status === 'open') {
    return isViewer(wait.assignee, people.me) ? (
      <Badge tone="signal" approval="waiting">
        {label}
      </Badge>
    ) : (
      <Badge tone="warning">{label}</Badge>
    );
  }
  return <Badge tone={wait.status === 'resolved' ? 'success' : 'neutral'}>{label}</Badge>;
}
