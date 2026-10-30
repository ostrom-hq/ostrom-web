// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgView } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Banner } from '@/shared/ui/Banner';
import { EmptyState, Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { OrgRole } from './roles';
import { useCurrentOrg } from './useCurrentOrg';

export interface WithOrgProps {
  /** The screen's title while the organization is not known yet. */
  readonly title: string;
  readonly rows?: number;
  /** The screen, once the organization is known. */
  readonly children: (org: OrgView, role: OrgRole | undefined) => ReactNode;
}

/**
 * A screen of one organization: the screen once the organization is known; until then its title and shape, how
 * to create one for a person in none, or the way to choose for a person in several.
 */
export function WithOrg({ title, rows = 3, children }: WithOrgProps): ReactElement {
  const { t } = useTranslation();
  const { org, role, none, choosing, failure, choose } = useCurrentOrg();
  if (org !== undefined) return <>{children(org, role)}</>;
  let body: ReactNode;
  if (none) {
    body = (
      <EmptyState title={t('orgs.gate.noneTitle')}>
        {t('orgs.gate.none')} <Link to="/">{t('orgs.gate.create')}</Link>
      </EmptyState>
    );
  } else if (choosing) {
    body = (
      <EmptyState title={t('orgs.gate.chooseTitle')}>
        <Button onClick={choose}>{t('orgs.switch.choose')}</Button>
      </EmptyState>
    );
  } else {
    body =
      failure === undefined ? (
        <Skeleton rows={rows} />
      ) : (
        <Banner tone="warning" tag={t('app.failure.tag')}>
          {failure.message}
        </Banner>
      );
  }
  return <Screen title={title}>{body}</Screen>;
}
