// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Section } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { SessionActionsViewModel, SessionsViewModel } from '../useSettings';
import { SessionRow } from './SessionRow';

export interface SecuritySectionProps {
  readonly view: SessionsViewModel;
  readonly actions: SessionActionsViewModel;
}

/** How fresh a sign-in a yes needs, the person's signed-in sessions, and the way to end them all. */
export function SecuritySection({ view, actions }: SecuritySectionProps): ReactElement {
  const { t } = useTranslation();
  const trouble = view.failure ?? actions.failure;
  let list: ReactElement | null = null;
  if (view.sessions !== undefined)
    list = (
      <ul className="o-rows">
        {view.sessions.map((session) => (
          <li key={session.id}>
            <SessionRow
              session={session}
              locked={actions.revoking !== undefined || actions.signingOut}
              onRevoke={() => {
                actions.revoke(session);
              }}
            />
          </li>
        ))}
      </ul>
    );
  else if (!view.unavailable && view.failure === undefined) list = <Skeleton rows={2} />;
  return (
    <Section label={t('settings.security.title')}>
      <p>
        {t('settings.security.fresh')}{' '}
        <Link to="/signin" search={{ redirect: '/settings' }}>
          {t('settings.security.signInAgain')}
        </Link>
      </p>
      {/* A server that does not list sessions yet: only the way to end them all is left. */}
      {view.unavailable ? null : <h3 className="o-field-label">{t('settings.sessions.title')}</h3>}
      {list}
      {trouble === undefined ? null : (
        <Banner tone="danger" tag={t('settings.sessions.errorTag')} live>
          {trouble.message}
        </Banner>
      )}
      <p className="o-row__meta">{t('settings.sessions.everywhereNote')}</p>
      <span className="o-self-start">
        <ConfirmButton
          label={t('settings.sessions.everywhere')}
          confirm={t('settings.sessions.everywhereConfirm')}
          keep={t('settings.sessions.keep')}
          disabled={actions.signingOut}
          onConfirm={actions.signOutEverywhere}
        />
      </span>
    </Section>
  );
}
