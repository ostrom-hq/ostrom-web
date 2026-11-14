// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import type { OrgMembers } from '@/shared/org/members';
import { Button } from './Button';

/**
 * "Show more people": the next page of the organization's members, read when asked; nothing once all are read. When
 * the next page could not be read, it says so beside the button, which asks for it again: the people read stay.
 */
export function MorePeople({
  people,
}: {
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore'> & Partial<Pick<OrgMembers, 'moreFailed'>>;
}): ReactElement | null {
  const { t } = useTranslation();
  if (people.more === undefined) return null;
  const button = (
    <Button variant="ghost" disabled={people.loadingMore} onClick={people.more}>
      {t('app.morePeople')}
    </Button>
  );
  if (people.moreFailed !== true || people.loadingMore) return button;
  return (
    <span className="o-inline">
      <span className="o-row__meta" role="alert">
        {t('app.morePeopleFailed')}
      </span>
      {button}
    </span>
  );
}
