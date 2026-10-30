import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { type ReactElement, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  analytics,
  analyticsConfig,
  ConsentBanner,
  PRIVACY_URL,
  PrivacyChoices,
  useConsentStore,
} from '@/shared/analytics';
import { useApplyTheme } from '@/shared/theme/useTheme';
import { OstromMark } from '@/shared/ui/OstromMark';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

export function AppShell(): ReactElement {
  const { t } = useTranslation();
  useApplyTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const consent = useConsentStore((state) => state.status);
  // A page view per route, and one for the current page right after a yes.
  useEffect(() => {
    analytics.pageview(pathname);
  }, [pathname, consent]);
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
        </nav>
        <div className="o-topbar__end">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="o-main">
        <Outlet />
      </main>
      <footer className="o-footer">
        <PrivacyChoices configured={analyticsConfig !== null} />
      </footer>
      <ConsentBanner analytics={analytics} configured={analyticsConfig !== null} privacyUrl={PRIVACY_URL} />
    </div>
  );
}
