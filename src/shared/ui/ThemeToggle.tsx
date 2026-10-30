import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/theme/useTheme';

export function ThemeToggle(): ReactElement {
  const { t } = useTranslation();
  const { resolved, toggle } = useTheme();
  const label = resolved === 'dark' ? t('app.theme.toLight') : t('app.theme.toDark');
  return (
    <button
      type="button"
      className="o-btn o-btn--ghost o-icon-btn"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{resolved === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
