import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import type { ThemePreference } from '@/shared/theme/themeStore';
import { useTheme } from '@/shared/theme/useTheme';
import { Button } from '@/shared/ui/Button';

const ICONS: Readonly<Record<ThemePreference, string>> = { system: '◐', light: '☀', dark: '☾' };

export function ThemeToggle(): ReactElement {
  const { t } = useTranslation();
  const { preference, next, cycle } = useTheme();
  const label = t('app.theme.switch', {
    current: t(`app.theme.names.${preference}`),
    next: t(`app.theme.names.${next}`),
  });
  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={label} title={label}>
      <span aria-hidden="true">{ICONS[preference]}</span>
    </Button>
  );
}
