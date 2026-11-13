// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/shared/api/apiClient';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { looksLikeEmail, safeRedirect } from '../model';
import { useEmailSignIn } from '../useSignIn';

/**
 * GitHub, or a link by e-mail: the ways in, for the sign-in page and for the setup link's page. `redirect` is the
 * page to come back to, only ever a path of this site.
 */
export function SignInChoices({ redirect }: { readonly redirect: string | undefined }): ReactElement {
  const { t } = useTranslation();
  const target = safeRedirect(redirect);
  const email = useEmailSignIn(redirect === undefined ? undefined : target);
  const [address, setAddress] = useState('');
  const fieldId = useId();
  const valid = looksLikeEmail(address);
  return (
    <>
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
          <div className="o-stack">
            <Banner tag={t('signin.email.sentTag')} live>
              {t('signin.email.sent', { email: email.sentTo })}
            </Banner>
            <div>
              <Button variant="ghost" onClick={email.again}>
                {t('signin.email.other')}
              </Button>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
