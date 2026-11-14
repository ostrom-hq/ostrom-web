// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceAdmin } from '@/shared/auth/useInstanceAdmin';
import { Banner } from '@/shared/ui/Banner';
import { Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';

export interface AdminFrameProps {
  readonly title: string;
  readonly lead: string;
  readonly children: ReactNode;
}

/**
 * The instance's administration: its two screens under one heading. The content is asked of the server only for a
 * person who administers the instance; anyone else reads why not, and nothing is requested.
 */
export function AdminFrame({ title, lead, children }: AdminFrameProps): ReactElement {
  const { t } = useTranslation();
  const instanceAdmin = useInstanceAdmin();
  let body: ReactNode;
  if (instanceAdmin === undefined) body = <Skeleton rows={3} />;
  else if (instanceAdmin) body = children;
  else
    body = (
      <Banner tone="warning" tag={t('admin.forbidden.tag')}>
        {t('admin.forbidden.body')}
      </Banner>
    );
  return (
    <Screen title={title} lead={lead}>
      <nav className="o-inline" aria-label={t('admin.nav.label')}>
        <Link to="/admin" activeOptions={{ exact: true }}>
          {t('admin.nav.administrators')}
        </Link>
        <Link to="/admin/settings">{t('admin.nav.settings')}</Link>
      </nav>
      {body}
    </Screen>
  );
}
