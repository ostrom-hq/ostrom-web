// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { SECRET_NAME } from '../model';
import type { SecretChangeViewModel } from '../useTools';

/** The value field is a password field: it is never shown, and it is emptied as soon as the server took it. */
export function AddSecretForm({ change }: { readonly change: SecretChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const nameId = useId();
  const valueId = useId();
  const trimmed = name.trim();
  const badName = trimmed !== '' && !SECRET_NAME.test(trimmed);
  return (
    <Section label={t('tools.secrets.add.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          change.create(trimmed, value, () => {
            setName('');
            setValue('');
          });
        }}
      >
        <label htmlFor={nameId} className="o-field-label">
          {t('tools.secrets.add.name')}
        </label>
        <input
          id={nameId}
          className="o-input o-mono"
          autoComplete="off"
          spellCheck={false}
          placeholder="NPM_TOKEN"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {badName ? (
          <Banner tone="warning" tag={t('tools.secrets.add.problemTag')} live>
            {t('tools.secrets.add.badName')}
          </Banner>
        ) : null}
        <label htmlFor={valueId} className="o-field-label">
          {t('tools.secrets.add.value')}
        </label>
        <input
          id={valueId}
          className="o-input o-mono"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <div className="o-inline">
          <Button
            type="submit"
            disabled={change.pending === true || trimmed === '' || badName || value === ''}
          >
            {change.pending === true ? t('tools.secrets.add.saving') : t('tools.secrets.add.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
