// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrgMembers } from '@/shared/org/members';
import { Button } from './Button';

/** "Show more people": the next page of the organization's members, read when asked; nothing once all are read. */
export function MorePeople({
  people,
}: {
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore'>;
}): ReactElement | null {
  const { t } = useTranslation();
  if (people.more === undefined) return null;
  return (
    <Button variant="ghost" disabled={people.loadingMore} onClick={people.more}>
      {t('app.morePeople')}
    </Button>
  );
}
