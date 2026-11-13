// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { orgRoleOf } from '@/shared/org/roles';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { useInvitation } from '../useInvitation';

/** `/invite#token=…`: what the invitation leads to, then one click to join, after signing in if need be. */
export function InviteScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const invitation = useInvitation();
  const { open } = invitation;
  /** The role in words; one the console does not know, as the server wrote it. */
  const roleName = (role: string): string => {
    const known = orgRoleOf(role);
    return known === undefined ? role : t(`members.role.${known}`);
  };
  if (invitation.state === 'missing' || invitation.state === 'dead') {
    return (
      <Screen title={t('invite.title')}>
        <EmptyState title={t(`invite.${invitation.state}.title`)}>
          <p>{t(`invite.${invitation.state}.body`)}</p>
          <Link to="/" className="o-btn o-btn--secondary o-btn--md">
            {t('invite.home')}
          </Link>
        </EmptyState>
      </Screen>
    );
  }
  if (open === undefined) {
    return (
      <Screen title={t('invite.title')}>
        {invitation.failure === undefined ? (
          <Skeleton rows={3} />
        ) : (
          <Banner tone="warning" tag={t('app.failure.tag')} live>
            {invitation.failure.message}
          </Banner>
        )}
      </Screen>
    );
  }
  const { preview } = open;
  const expires = new Date(preview.expiresAt).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <Screen
      title={t('invite.joinTitle', { org: preview.orgName })}
      lead={t('invite.lead', { role: roleName(preview.role) })}
    >
      <div className="o-card o-section o-stack">
        <dl className="o-facts">
          <dt>{t('invite.org')}</dt>
          <dd>
            {preview.orgName} <span className="o-row__meta o-mono">{preview.orgSlug}</span>
          </dd>
          <dt>{t('invite.role')}</dt>
          <dd>{roleName(preview.role)}</dd>
          {preview.email === null ? null : (
            <>
              <dt>{t('invite.for')}</dt>
              <dd>{preview.email}</dd>
            </>
          )}
          <dt>{t('invite.expires')}</dt>
          <dd>{expires}</dd>
        </dl>
        {invitation.already ? (
          <Banner tone="info" tag={t('invite.alreadyTag')} live>
            {t('invite.already', { org: preview.orgName })}
          </Banner>
        ) : null}
        {invitation.refused ? (
          <Banner tone="danger" tag={t('invite.refusedTag')} live>
            {t('invite.refused')}
          </Banner>
        ) : null}
        {invitation.grantFailed ? (
          <Banner tone="warning" tag={t('invite.checkFailedTag')} live>
            {t('invite.checkFailed')}
          </Banner>
        ) : null}
        {invitation.failure === undefined ? null : (
          <Banner tone="danger" tag={t('invite.failedTag')} live>
            {invitation.failure.message}
          </Banner>
        )}
        <div>
          {invitation.signedIn === false ? (
            invitation.granting ? (
              <Button variant="secondary" disabled>
                {t('invite.checking')}
              </Button>
            ) : invitation.grantFailed ? (
              <Button variant="secondary" onClick={invitation.signIn}>
                {t('invite.signIn')}
              </Button>
            ) : (
              <Link
                to="/signin"
                search={{ redirect: '/invite' }}
                className="o-btn o-btn--secondary o-btn--md"
              >
                {t('invite.signIn')}
              </Link>
            )
          ) : invitation.already ? (
            <Button onClick={open.enter} disabled={invitation.entering}>
              {t('invite.open', { org: preview.orgName })}
            </Button>
          ) : (
            <Button onClick={open.accept} disabled={open.accept === undefined || invitation.accepting}>
              {invitation.accepting ? t('invite.joining') : t('invite.join', { org: preview.orgName })}
            </Button>
          )}
        </div>
      </div>
    </Screen>
  );
}
