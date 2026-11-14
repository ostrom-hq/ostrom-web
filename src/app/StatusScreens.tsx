import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Skeleton } from '@/shared/ui/Skeleton';

export function NotFoundScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="o-page">
      <h1>{t('app.notFound.title')}</h1>
      <p className="o-lead">{t('app.notFound.body')}</p>
      <p>
        <Link to="/">{t('app.notFound.home')}</Link>
      </p>
    </section>
  );
}

/** While a screen's chunk is on its way (a slow network): the shape of a page, announced as loading. */
export function PendingScreen(): ReactElement {
  return (
    <section className="o-page">
      <Skeleton />
    </section>
  );
}

export function ErrorScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="o-page" role="alert">
      <h1>{t('app.error.title')}</h1>
      <p className="o-lead">{t('app.error.body')}</p>
    </section>
  );
}

/** A direct address to a screen whose feature the server does not serve (the navigation does not list it). */
export function FeatureUnavailableScreen({ name }: { readonly name: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="o-page">
      <h1>{t('app.server.unavailableTitle', { name })}</h1>
      <p className="o-lead">{t('app.server.unavailableBody')}</p>
      <p>
        <Link to="/">{t('app.notFound.home')}</Link>
      </p>
    </section>
  );
}
