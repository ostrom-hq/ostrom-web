// SPDX-License-Identifier: AGPL-3.0-only
import { useSearch } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/shared/api/apiClient';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Screen, Section } from '@/shared/ui/Screen';
import { looksLikeEmail, safeRedirect } from '../model';
import { useEmailSignIn } from '../useSignIn';

/** GitHub, or a link by e-mail. The session lands in a cookie no script reads; this page never sees a token. */
export function SignInScreen(): ReactElement {
  const { t } = useTranslation();
  const { redirect } = useSearch({ from: '/signin' });
  const target = safeRedirect(redirect);
  const email = useEmailSignIn(redirect === undefined ? undefined : target);
  const [address, setAddress] = useState('');
  const fieldId = useId();
  const valid = looksLikeEmail(address);
  return (
    <Screen title={t('signin.title')} lead={t('signin.lead')}>
      <Section label={t('signin.github.label')}>
        <a
          className="o-btn o-btn--secondary o-btn--md"
          href={apiUrl('/api/v1/auth/github/start', { redirect: target })}
        >
          {t('signin.github.go')}
        </a>
      </Section>
      <Section label={t('signin.email.label')}>
        {email.sentTo === undefined ? (
          <form
            className="o-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) email.send(address);
            }}
          >
            <label htmlFor={fieldId} className="o-field-label">
              {t('signin.email.field')}
            </label>
            <input
              id={fieldId}
              className="o-input"
              type="email"
              autoComplete="email"
              placeholder={t('signin.email.placeholder')}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
              }}
            />
            {email.failure === undefined ? null : (
              <Banner tone="danger" tag={t('signin.email.failedTag')} live>
                {email.failure.message}
              </Banner>
            )}
            <div>
              <Button variant="secondary" type="submit" disabled={!valid || email.sending}>
                {email.sending ? t('signin.email.sending') : t('signin.email.send')}
              </Button>
            </div>
          </form>
        ) : (
          <Banner tag={t('signin.email.sentTag')} live>
            {t('signin.email.sent', { email: email.sentTo })}
          </Banner>
        )}
      </Section>
    </Screen>
  );
}
