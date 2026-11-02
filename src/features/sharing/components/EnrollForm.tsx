// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgMember, Secret } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseUsd } from '@/shared/lib/money';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { isProvider, PROVIDERS, type Provider } from '../model';
import type { AccountChangeViewModel } from '../useSharing';

export interface EnrollFormProps {
  readonly change: AccountChangeViewModel;
  readonly secrets: readonly Secret[];
  /** The other members, to lend the subscription to. */
  readonly members: readonly OrgMember[];
}

/** The token is never typed here: it is a secret already stored, named by the form and encrypted by the server. */
export function EnrollForm({ change, secrets, members }: EnrollFormProps): ReactElement {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [label, setLabel] = useState('');
  const [credential, setCredential] = useState('');
  const [daily, setDaily] = useState('');
  const [sharedWith, setSharedWith] = useState<readonly string[]>([]);
  const providerId = useId();
  const labelId = useId();
  const credentialId = useId();
  const dailyId = useId();
  const trimmed = label.trim();
  const amount = daily.trim() === '' ? undefined : parseUsd(daily);
  const badDaily = daily.trim() !== '' && amount === undefined;
  return (
    <Section label={t('sharing.enroll.title')}>
      {secrets.length === 0 ? (
        <p className="o-row__meta">
          {t('sharing.enroll.noSecret')} <Link to="/secrets">{t('sharing.enroll.toSecrets')}</Link>
        </p>
      ) : (
        <form
          className="o-stack"
          onSubmit={(event) => {
            event.preventDefault();
            change.enroll(
              {
                provider,
                label: trimmed,
                credentialSecret: credential,
                sharedWith: [...sharedWith],
                ...(amount === undefined ? {} : { dailyAllocationUsd: amount }),
              },
              () => {
                setLabel('');
                setCredential('');
                setDaily('');
                setSharedWith([]);
              },
            );
          }}
        >
          <label htmlFor={providerId} className="o-field-label">
            {t('sharing.enroll.provider')}
          </label>
          <select
            id={providerId}
            className="o-input"
            value={provider}
            onChange={(event) => {
              if (isProvider(event.target.value)) setProvider(event.target.value);
            }}
          >
            {PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {t(`sharing.provider.${value}`)}
              </option>
            ))}
          </select>
          <label htmlFor={labelId} className="o-field-label">
            {t('sharing.enroll.label')}
          </label>
          <input
            id={labelId}
            className="o-input"
            autoComplete="off"
            placeholder={t('sharing.enroll.labelPlaceholder')}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <label htmlFor={credentialId} className="o-field-label">
            {t('sharing.enroll.credential')}
          </label>
          <select
            id={credentialId}
            className="o-input o-mono"
            aria-describedby={`${credentialId}-hint`}
            value={credential}
            onChange={(event) => {
              setCredential(event.target.value);
            }}
          >
            <option value="">{t('sharing.enroll.pickSecret')}</option>
            {secrets.map((secret) => (
              <option key={secret.name} value={secret.name}>
                {secret.name}
              </option>
            ))}
          </select>
          <p id={`${credentialId}-hint`} className="o-row__meta">
            {t('sharing.enroll.credentialHint')}
          </p>
          <label htmlFor={dailyId} className="o-field-label">
            {t('sharing.enroll.daily')}
          </label>
          <input
            id={dailyId}
            className="o-input sh-amount"
            inputMode="decimal"
            autoComplete="off"
            value={daily}
            onChange={(event) => {
              setDaily(event.target.value);
            }}
          />
          {badDaily ? (
            <Banner tone="warning" tag={t('sharing.enroll.problemTag')} live>
              {t('sharing.enroll.badDaily')}
            </Banner>
          ) : null}
          {members.length === 0 ? null : (
            <fieldset className="o-stack sh-people">
              <legend className="o-field-label">{t('sharing.enroll.sharedWith')}</legend>
              {members.map((member) => (
                <label key={member.login} className="o-inline">
                  <input
                    type="checkbox"
                    checked={sharedWith.includes(member.login)}
                    onChange={(event) => {
                      setSharedWith(
                        event.target.checked
                          ? [...sharedWith, member.login]
                          : sharedWith.filter((login) => login !== member.login),
                      );
                    }}
                  />
                  {/* A name the server has not been given is empty, or the login again: the login alone then. */}
                  <span>
                    {member.name === '' || member.name === member.login
                      ? member.login
                      : `${member.name} (${member.login})`}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="o-inline">
            <Button
              type="submit"
              disabled={change.pending === true || trimmed === '' || credential === '' || badDaily}
            >
              {change.pending === true ? t('sharing.enroll.saving') : t('sharing.enroll.submit')}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
