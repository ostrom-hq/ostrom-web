import { Link, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useApplyTheme } from '@/shared/theme/useTheme';
import { OstromMark } from '@/shared/ui/OstromMark';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

export function AppShell(): ReactElement {
  const { t } = useTranslation();
  useApplyTheme();
  return (
    <div className="o-shell">
      <a className="o-skip" href="#main">
        {t('app.skipToContent')}
      </a>
      <header className="o-topbar">
        <Link to="/" className="o-brand">
          <OstromMark size={22} />
          <span>{t('app.name')}</span>
        </Link>
        <nav className="o-nav" aria-label={t('app.nav.label')}>
          <Link to="/" activeOptions={{ exact: true }}>
            {t('app.nav.home')}
          </Link>
          <Link to="/yes">{t('app.nav.yes')}</Link>
          <Link to="/sessions">{t('app.nav.sessions')}</Link>
          <Link to="/receipts">{t('app.nav.receipts')}</Link>
          <Link to="/members">{t('app.nav.members')}</Link>
          <Link to="/workflows">{t('app.nav.workflows')}</Link>
          <Link to="/approvers">{t('app.nav.approvers')}</Link>
          <Link to="/rules">{t('app.nav.rules')}</Link>
          <Link to="/decisions">{t('app.nav.decisions')}</Link>
        </nav>
        <div className="o-topbar__end">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="o-main">
        <Outlet />
      </main>
    </div>
  );
}
