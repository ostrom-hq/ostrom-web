import { Link, Outlet, useMatches, useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  analytics,
  analyticsConfig,
  ConsentBanner,
  PRIVACY_URL,
  PrivacyChoices,
  useConsentStore,
  usePageViews,
} from '@/shared/analytics';
import { OrgControls } from '@/features/orgs';
import { useOrgStore } from '@/shared/org/orgStore';
import { useApplyTheme } from '@/shared/theme/useTheme';
import { OstromMark } from '@/shared/ui/OstromMark';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

export function AppShell(): ReactElement {
  const { t } = useTranslation();
  useApplyTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const organizationGeneration = useOrgStore((state) => state.generation);
  const anonymousPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.anonymous === true),
  });
  const consent = useConsentStore((state) => state.status);
  usePageViews(analytics, pathname, consent);
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
          <Link to="/github">{t('app.nav.github')}</Link>
          <Link to="/workflows">{t('app.nav.workflows')}</Link>
          <Link to="/approvers">{t('app.nav.approvers')}</Link>
          <Link to="/rules">{t('app.nav.rules')}</Link>
          <Link to="/activity">{t('app.nav.activity')}</Link>
          <Link to="/decisions">{t('app.nav.decisions')}</Link>
          <Link to="/audit">{t('app.nav.audit')}</Link>
          <Link to="/policy">{t('app.nav.policy')}</Link>
          <Link to="/mcp">{t('app.nav.mcp')}</Link>
          <Link to="/secrets">{t('app.nav.secrets')}</Link>
          <Link to="/import">{t('app.nav.import')}</Link>
          <Link to="/spend">{t('app.nav.spend')}</Link>
          <Link to="/billing">{t('app.nav.billing')}</Link>
          <Link to="/settings">{t('app.nav.settings')}</Link>
          <Link to="/tokens">{t('app.nav.tokens')}</Link>
          <Link to="/cloud">{t('app.nav.cloud')}</Link>
          <Link to="/automations">{t('app.nav.automations')}</Link>
          <Link to="/artifacts">{t('app.nav.artifacts')}</Link>
          <Link to="/accounts">{t('app.nav.accounts')}</Link>
          <Link to="/signin">{t('app.nav.signin')}</Link>
        </nav>
        <div className="o-topbar__end">
          <OrgControls anonymousPage={anonymousPage} />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="o-main">
        {/* A screen opened in one organization never acts in the next: a switch opens it afresh. */}
        <Outlet key={organizationGeneration} />
      </main>
      <footer className="o-footer">
        <PrivacyChoices analytics={analytics} configured={analyticsConfig !== null} />
      </footer>
      <ConsentBanner analytics={analytics} configured={analyticsConfig !== null} privacyUrl={PRIVACY_URL} />
    </div>
  );
}
