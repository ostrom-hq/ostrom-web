import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

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

export function ErrorScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="o-page" role="alert">
      <h1>{t('app.error.title')}</h1>
      <p className="o-lead">{t('app.error.body')}</p>
    </section>
  );
}
