// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
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
              {view.code === undefined ? t('device.malformed') : t('device.unknown', { code: view.code })}
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

/**
 * The organization an admin sign-in acts in: chosen among those the person owns or administers when there are
 * several, said when there is one, and nothing when there is none (the approval then says why it is refused).
 */
function ActsIn({ open }: { readonly open: OpenDeviceLogin }): ReactElement | null {
  const { t } = useTranslation();
  const id = useId();
  const { orgs, org } = open;
  // Not read yet, or none the person manages: the approval then says why the server refuses it.
  if (org === undefined || orgs.length === 0) return null;
  if (orgs.length === 1) return <Facts facts={[{ label: t('device.org'), value: org.name }]} />;
  return (
    <div className="o-stack">
      <label htmlFor={id} className="o-field-label">
        {t('device.org')}
      </label>
      <select
        id={id}
        className="o-input"
        value={org.id}
        disabled={open.answering}
        onChange={(event) => {
          open.pick(event.target.value);
        }}
      >
        {orgs.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The hour and minute of a moment, in the reader's language: a login lives ten minutes. */
function clockTime(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
}

/**
 * A pending login: what asks, its code, when and from which network it asked (web audit 2, W3: a code someone else
 * sent shows), until when, what an admin sign-in would give, and the two answers.
 */
function LoginRequest({ open }: { readonly open: OpenDeviceLogin }): ReactElement {
  const { t, i18n } = useTranslation();
  const { login } = open;
  return (
    <Screen title={t('device.title')} lead={t('device.lead')}>
      <div className="o-stack">
        <Section label={t('device.code')}>
          <p className="o-device__code o-mono">{login.userCode}</p>
          <Facts
            facts={[
              { label: t('device.client'), value: login.clientName },
              { label: t('device.requestedAt'), value: clockTime(login.requestedAt, i18n.language) },
              login.requestedFrom === undefined
                ? undefined
                : { label: t('device.requestedFrom'), value: login.requestedFrom, mono: true },
              { label: t('device.expires'), value: clockTime(login.expiresAt, i18n.language) },
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
            <ActsIn open={open} />
          </div>
        )}
        {open.forbidden ? (
          <Banner tone="danger" tag={t('device.forbiddenTag')} live>
            {t('device.forbidden')}
          </Banner>
        ) : null}
        {open.severalOrgs ? (
          <Banner tone="danger" tag={t('device.forbiddenTag')} live>
            {t('device.severalOrgs')}
          </Banner>
        ) : null}
        {open.failure === undefined ? null : (
          <Banner tone="danger" tag={t('device.failedTag')} live>
            <FailureText failure={open.failure} />
          </Banner>
        )}
        <div className="o-device__actions">
          <Button variant="primary" onClick={open.approve} disabled={open.answering || open.choosing}>
            {login.scopes === undefined ? t('device.approve') : t('device.approveAdmin')}
          </Button>
          <Button onClick={open.deny} disabled={open.answering}>
            {t('device.deny')}
          </Button>
        </div>
      </div>
    </Screen>
  );
}
