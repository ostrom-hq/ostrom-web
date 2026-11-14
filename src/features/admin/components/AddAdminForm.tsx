// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { Section } from '@/shared/ui/Screen';
import type { AddAdminViewModel } from '../useAdmin';

/** The longest address the server reads. */
const EMAIL_MAX = 320;

/** Makes the person who owns a verified address an administrator: the server answers the same for any other. */
export function AddAdminForm({ add }: { readonly add: AddAdminViewModel }): ReactElement {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const emailId = useId();
  const typed = email.trim();
  return (
    <Section label={t('admin.administrators.add.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          add.add(typed, () => {
            setEmail('');
          });
        }}
      >
        <label htmlFor={emailId} className="o-field-label">
          {t('admin.administrators.add.email')}
        </label>
        <input
          id={emailId}
          type="email"
          className="o-input"
          autoComplete="off"
          maxLength={EMAIL_MAX}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <p className="o-row__meta">{t('admin.administrators.add.hint')}</p>
        <div className="o-inline">
          <Button type="submit" disabled={add.adding || typed === ''}>
            {add.adding ? t('admin.administrators.add.adding') : t('admin.administrators.add.submit')}
          </Button>
        </div>
      </form>
      {add.failure === undefined ? null : (
        <Banner tone="danger" tag={t('admin.administrators.errorTag')} live>
          <FailureText failure={add.failure} />
        </Banner>
      )}
    </Section>
  );
}
