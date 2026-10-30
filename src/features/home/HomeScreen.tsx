import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="o-page">
      <h1>{t('home.title')}</h1>
      <p className="o-lead">{t('home.lead')}</p>
    </section>
  );
}
