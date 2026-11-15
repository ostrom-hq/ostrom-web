import { Link, Outlet, useMatches, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { OrgControls } from '@/features/orgs';
import { blocks, Feature, useServerStatus } from '@/shared/capabilities';
import { useOrgStore } from '@/shared/org/orgStore';
import { useApplyTheme } from '@/shared/theme/useTheme';
import { OstromMark } from '@/shared/ui/OstromMark';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { useMediaQuery } from '@/shared/ui/useMediaQuery';
import { NavLabel } from '@/app/NavLabel';
import { NavMenu } from '@/app/NavMenu';
import { needOf } from '@/app/navigation';
import { ServerBlockedScreen } from '@/app/ServerBlockedScreen';
import { FeatureUnavailableScreen } from '@/app/StatusScreens';
import { useNavLinks } from '@/app/useNavLinks';
import type * as AnalyticsModule from '@/app/AnalyticsLayer';

// Analytics is not needed to paint the console: it loads once the first paint is done. A chunk that does not load
// (offline, blocked) leaves the console without it: nothing shows, nothing breaks.
const NOTHING = (): ReactElement => <></>;
type AnalyticsChunk = Pick<typeof AnalyticsModule, 'AnalyticsLayer' | 'FooterPrivacy'>;
const analyticsChunk = async (): Promise<AnalyticsChunk> =>
  import('@/app/AnalyticsLayer').catch(() => ({ AnalyticsLayer: NOTHING, FooterPrivacy: NOTHING }));
const AnalyticsLayer = lazy(async () => analyticsChunk().then((m) => ({ default: m.AnalyticsLayer })));
const FooterPrivacy = lazy(async () => analyticsChunk().then((m) => ({ default: m.FooterPrivacy })));

/** True from the first frame after the first paint. */
function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        setReady(true);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  return ready;
}

export function AppShell(): ReactElement {
  const { t } = useTranslation();
  useApplyTheme();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const organizationGeneration = useOrgStore((state) => state.generation);
  const anonymousPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.anonymous === true),
  });
  const afterPaint = useAfterFirstPaint();
  const server = useServerStatus();
  const links = useNavLinks();
  // A phone's screen, where shell.css shows the menu instead of the bar: the bar is then not rendered at all, rather
  // than rendered and hidden, as its links cost a slow phone's CPU before the first paint (e2e-real/vitals.spec.ts).
  // It comes back when the screen widens.
  const phone = useMediaQuery('(max-width: 640px)');
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
        {phone ? null : (
          <nav className="o-nav" aria-label={t('app.nav.label')}>
            {links.map((link) => (
              <Link key={link.to} to={link.to} activeOptions={{ exact: link.to === '/' }}>
                <NavLabel label={link.label} />
              </Link>
            ))}
          </nav>
        )}
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
        {afterPaint ? (
          <Suspense fallback={null}>
            <FooterPrivacy />
          </Suspense>
        ) : null}
      </footer>
      {afterPaint ? (
        <Suspense fallback={null}>
          <AnalyticsLayer pathname={pathname} />
        </Suspense>
      ) : null}
    </div>
  );
}
