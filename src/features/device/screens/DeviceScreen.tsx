// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { EmptyState, Facts, Screen, Section } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { CodeForm } from '../components/CodeForm';
import { type OpenDeviceLogin, useDeviceLogin } from '../useDeviceLogin';
import './device.css';

/**
 * `/device`, where `ostrom login` sends the person (RFC 8628): the login their terminal started, its code to compare
 * with the terminal's, then a yes or a no. Reached by the CLI's link, never from the navigation.
 */
export function DeviceScreen(): ReactElement {
  const { t } = useTranslation();
  const { view, read } = useDeviceLogin();
  switch (view.stage) {
    case 'enter':
      return (
        <Screen title={t('device.title')} lead={t('device.enterLead')}>
          <CodeForm onRead={read} />
        </Screen>
      );
    case 'unknown':
      return (
        <Screen title={t('device.title')} lead={t('device.enterLead')}>
          <div className="o-stack">
            <Banner tone="warning" tag={t('device.unknownTag')} live>
              {t('device.unknown', { code: view.code })}
            </Banner>
            <CodeForm onRead={read} />
          </div>
        </Screen>
      );
    case 'signedOut':
      return (
        <Screen title={t('device.title')}>
          <div className="o-stack">
            <EmptyState title={t('device.signedOut.title')}>{t('device.signedOut.body')}</EmptyState>
            <div>
              <Link
                to="/signin"
                search={{ redirect: view.back }}
                className="o-btn o-btn--secondary o-btn--md"
              >
                {t('device.signedOut.action')}
              </Link>
            </div>
          </div>
        </Screen>
      );
    case 'reading':
      return (
        <Screen title={t('device.title')}>
          {view.failure === undefined ? (
            <Skeleton rows={3} />
          ) : (
            <Banner tone="warning" tag={t('app.failure.tag')} live>
              {view.failure.message}
            </Banner>
          )}
        </Screen>
      );
    case 'open':
      return <LoginRequest open={view} />;
    case 'approved':
    case 'denied':
    case 'gone':
      return (
        <Screen title={t('device.title')}>
          <EmptyState title={t(`device.${view.stage}.title`)}>{t(`device.${view.stage}.body`)}</EmptyState>
        </Screen>
      );
  }
}

/** A pending login: what asks, its code, until when, what an admin sign-in would give, and the two answers. */
function LoginRequest({ open }: { readonly open: OpenDeviceLogin }): ReactElement {
  const { t, i18n } = useTranslation();
  const { login } = open;
  const expires = new Date(login.expiresAt).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Screen title={t('device.title')} lead={t('device.lead')}>
      <div className="o-stack">
        <Section label={t('device.code')}>
          <p className="o-device__code o-mono">{login.userCode}</p>
          <Facts
            facts={[
              { label: t('device.client'), value: login.clientName },
              { label: t('device.expires'), value: expires },
            ]}
          />
        </Section>
        {login.scopes === undefined ? null : (
          <div className="o-stack">
            <Banner tone="warning" tag={t('device.adminTag')}>
              {t('device.admin')}
            </Banner>
            <ul className="o-device__scopes" aria-label={t('device.scopes')}>
              {login.scopes.map((scope) => (
                <li key={scope} className="o-mono">
                  {scope}
                </li>
              ))}
            </ul>
          </div>
        )}
        {open.forbidden ? (
          <Banner tone="danger" tag={t('device.forbiddenTag')} live>
            {t('device.forbidden')}
          </Banner>
        ) : null}
        {open.failure === undefined ? null : (
          <Banner tone="danger" tag={t('device.failedTag')} live>
            <FailureText failure={open.failure} />
          </Banner>
        )}
        <div className="o-device__actions">
          <Button variant="primary" onClick={open.approve} disabled={open.answering}>
            {t('device.approve')}
          </Button>
          <Button onClick={open.deny} disabled={open.answering}>
            {t('device.deny')}
          </Button>
        </div>
      </div>
    </Screen>
  );
}
