// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import {
  DEFAULT_LIFETIME,
  lifetimeOf,
  TOKEN_LIFETIMES,
  TOKEN_NAME_MAX,
  TOKEN_RESOURCES,
  type TokenLifetime,
  toggleScope,
  tokenDraftProblem,
} from '../model';
import type { CreateTokenViewModel } from '../useTokens';
import { NewSecret } from './NewSecret';

export interface TokenFormProps {
  readonly create: CreateTokenViewModel;
  /** A secret is on its way or on screen: nothing is created until it is copied. */
  readonly locked: boolean;
}

/** A name, what it may do and for how long; the secret comes back once. */
export function TokenForm({ create, locked }: TokenFormProps): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<readonly string[]>([]);
  const [days, setDays] = useState<TokenLifetime>(DEFAULT_LIFETIME);
  const nameId = useId();
  const daysId = useId();
  const problem = tokenDraftProblem(name, scopes);
  return (
    <Section label={t('tokens.form.title')}>
      <p className="o-row__meta">{t('tokens.form.lead')}</p>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          create.create(name, scopes, days, () => {
            setName('');
            setScopes([]);
            setDays(DEFAULT_LIFETIME);
          });
        }}
      >
        <label htmlFor={nameId} className="o-field-label">
          {t('tokens.form.name')}
        </label>
        <input
          id={nameId}
          className="o-input"
          maxLength={TOKEN_NAME_MAX}
          placeholder={t('tokens.form.namePlaceholder')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <fieldset className="o-stack tk-scopes">
          <legend className="o-field-label">{t('tokens.form.scopes')}</legend>
          {TOKEN_RESOURCES.map(({ resource, actions }) => (
            <div key={resource} className="tk-scope">
              <span className="tk-scope__name">{t(`tokens.resources.${resource}`)}</span>
              <span className="o-inline">
                {actions.map((action) => {
                  const scope = `${resource}:${action}`;
                  return (
                    <label key={action} className="o-inline tk-scope__action">
                      <input
                        type="checkbox"
                        aria-label={t('tokens.form.scopeNamed', {
                          resource: t(`tokens.resources.${resource}`),
                          action: t(`tokens.actions.${action}`),
                        })}
                        checked={scopes.includes(scope)}
                        onChange={(event) => {
                          setScopes(toggleScope(scopes, scope, event.target.checked));
                        }}
                      />
                      <span aria-hidden="true">{t(`tokens.actions.${action}`)}</span>
                    </label>
                  );
                })}
              </span>
            </div>
          ))}
        </fieldset>
        <p className="o-row__meta">{t('tokens.form.neverYes')}</p>
        <div className="o-inline">
          <label htmlFor={daysId} className="o-field-label">
            {t('tokens.form.expires')}
          </label>
          <select
            id={daysId}
            className="o-input o-select"
            value={String(days)}
            onChange={(event) => {
              setDays(lifetimeOf(event.target.value));
            }}
          >
            {TOKEN_LIFETIMES.map((option) => (
              <option key={String(option)} value={String(option)}>
                {option === null ? t('tokens.form.never') : t('tokens.form.days', { count: option })}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={locked || problem !== undefined}>
            {create.creating ? t('tokens.form.creating') : t('tokens.form.create')}
          </Button>
        </div>
        {days === null ? (
          <Banner tone="warning" tag={t('tokens.form.neverTag')}>
            {t('tokens.form.neverWarning')}
          </Banner>
        ) : null}
        {problem === 'scopes' ? <p className="o-row__meta">{t('tokens.form.pickScope')}</p> : null}
      </form>
      {create.created === undefined ? null : <NewSecret created={create.created} onDone={create.dismiss} />}
      {create.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tokens.form.errorTag')} live>
          {create.failure.message}
        </Banner>
      )}
    </Section>
  );
}
