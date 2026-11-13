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
import { blocks, Feature, useServerStatus } from '@/shared/capabilities';
import { useOrgStore } from '@/shared/org/orgStore';
import { useApplyTheme } from '@/shared/theme/useTheme';
import { OstromMark } from '@/shared/ui/OstromMark';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { NavLabel } from '@/app/NavLabel';
import { NavMenu } from '@/app/NavMenu';
import { needOf } from '@/app/navigation';
import { ServerBlockedScreen } from '@/app/ServerBlockedScreen';
import { FeatureUnavailableScreen } from '@/app/StatusScreens';
import { useNavLinks } from '@/app/useNavLinks';

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
  const server = useServerStatus();
  const links = useNavLinks();
  const need = needOf(pathname);
  const screen = <Outlet key={organizationGeneration} />;
  // A server the console cannot speak to: nothing of the console is offered but the explanation and the sign-out.
  if (blocks(server)) return <ServerBlockedScreen status={server} />;
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
        <NavMenu />
        <nav className="o-nav" aria-label={t('app.nav.label')}>
          {links.map((link) => (
            <Link key={link.to} to={link.to} activeOptions={{ exact: link.to === '/' }}>
              <NavLabel label={link.label} />
            </Link>
          ))}
        </nav>
        <div className="o-topbar__end">
          <OrgControls anonymousPage={anonymousPage} />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="o-main">
        {/* A screen opened in one organization never acts in the next: a switch opens it afresh. */}
        {need === undefined ? (
          screen
        ) : (
          <Feature
            name={need.feature}
            fallback={<FeatureUnavailableScreen name={t(`app.nav.${need.label}`)} />}
          >
            {screen}
          </Feature>
        )}
      </main>
      <footer className="o-footer">
        <PrivacyChoices analytics={analytics} configured={analyticsConfig !== null} />
      </footer>
      <ConsentBanner analytics={analytics} configured={analyticsConfig !== null} privacyUrl={PRIVACY_URL} />
    </div>
  );
}
