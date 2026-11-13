// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeature } from '@/shared/capabilities';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { CopyField } from '@/shared/ui/CopyField';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  DEFAULT_SERVICE_KEY_LIFETIME,
  SERVICE_KEY_LIFETIMES,
  isCiServiceKeyScope,
  SERVICE_KEY_CI_SCOPES,
  SERVICE_KEY_MEMBER_SCOPES,
  SERVICE_KEY_NAME_MAX,
  SERVICE_KEY_RESERVED_SCOPES,
  SERVICE_KEY_SCOPES,
  type ServiceKeyLifetime,
  type ServiceKeyScopeItem,
  serviceKeyDraftProblem,
  serviceKeyLifetimeOf,
  toggleServiceKeyScope,
} from '../model';
import type { ServiceKeysViewModel } from '../useKeysAndDevices';

export interface ServiceKeysSectionProps {
  readonly orgName: string;
  /** An owner or an admin: the others read who manages the keys, and nothing else. */
  readonly manages: boolean;
  readonly view: ServiceKeysViewModel;
}

/**
 * The organization's keys: for its CI (acting for the organization, each use audited) or, when the server serves the
 * wide catalogue, as the person who created them, within the scopes they carry.
 */
export function ServiceKeysSection({ orgName, manages, view }: ServiceKeysSectionProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  // Nothing ticked: a key acts for the whole organization, so it carries only what someone chose for it.
  const [scopes, setScopes] = useState<readonly string[]>([]);
  const [days, setDays] = useState<ServiceKeyLifetime>(DEFAULT_SERVICE_KEY_LIFETIME);
  const wide = useFeature('servicekeys.scopes.v1');
  const nameId = useId();
  const daysId = useId();
  if (!manages)
    return (
      <Section label={t('settings.serviceKeys.title')}>
        <p className="o-row__meta">{t('settings.serviceKeys.managersOnly')}</p>
      </Section>
    );
  const day = (at: string): string =>
    new Date(at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const scopeLabel = (scope: string): string => {
    const known = SERVICE_KEY_SCOPES.find((item) => item.scope === scope);
    return known === undefined ? scope : t(`settings.serviceKeys.scope.${known.label}`);
  };
  // One change at a time, and one secret: nothing changes while a key is made, deleted or its secret is on screen.
  const created =
    view.created?.secret === undefined ? undefined : { ...view.created, secret: view.created.secret };
  const locked = view.creating || created !== undefined || view.removing;
  const problem = serviceKeyDraftProblem(name, scopes);
  const groups: readonly {
    readonly id: 'ci' | 'member' | 'reserved';
    readonly items: readonly ServiceKeyScopeItem[];
  }[] = wide
    ? [
        { id: 'ci', items: SERVICE_KEY_CI_SCOPES },
        { id: 'member', items: SERVICE_KEY_MEMBER_SCOPES },
        { id: 'reserved', items: SERVICE_KEY_RESERVED_SCOPES },
      ]
    : [{ id: 'ci', items: SERVICE_KEY_CI_SCOPES }];
  // A CI scope and the others are never on one key: once one kind is ticked, the other waits until it is cleared.
  const other = (scope: string): boolean =>
    scopes.length > 0 && scopes.some((ticked) => isCiServiceKeyScope(ticked) !== isCiServiceKeyScope(scope));
  return (
    <Section label={t('settings.serviceKeys.title')}>
      <p className="o-row__meta">
        {t(wide ? 'settings.serviceKeys.leadWide' : 'settings.serviceKeys.lead', { name: orgName })}
      </p>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          view.create(name, scopes, days, () => {
            setName('');
          });
        }}
      >
        <label htmlFor={nameId} className="o-field-label">
          {t('settings.serviceKeys.name')}
        </label>
        <input
          id={nameId}
          className="o-input"
          maxLength={SERVICE_KEY_NAME_MAX}
          placeholder={t('settings.serviceKeys.namePlaceholder')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <fieldset className="o-stack">
          <legend className="o-field-label">{t('settings.serviceKeys.scopes')}</legend>
          {groups.map(({ id, items }) => (
            <div key={id} className="o-stack">
              {wide ? <p className="o-row__meta">{t(`settings.serviceKeys.group.${id}`)}</p> : null}
              {items.map(({ scope, label }) => (
                <label key={scope} className="o-inline">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    disabled={other(scope)}
                    onChange={(event) => {
                      setScopes(toggleServiceKeyScope(scopes, scope, event.target.checked));
                    }}
                  />
                  <span>{t(`settings.serviceKeys.scope.${label}`)}</span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
        {problem === 'scopes' ? <p className="o-row__meta">{t('settings.serviceKeys.pickScope')}</p> : null}
        <label htmlFor={daysId} className="o-field-label">
          {t('settings.serviceKeys.expires')}
        </label>
        <select
          id={daysId}
          className="o-input o-select"
          value={String(days)}
          onChange={(event) => {
            setDays(serviceKeyLifetimeOf(event.target.value));
          }}
        >
          {SERVICE_KEY_LIFETIMES.map((option) => (
            <option key={String(option)} value={String(option)}>
              {option === null
                ? t('settings.serviceKeys.never')
                : t('settings.serviceKeys.days', { count: option })}
            </option>
          ))}
        </select>
        <span className="o-self-start">
          <Button type="submit" disabled={locked || problem !== undefined}>
            {view.creating ? t('settings.serviceKeys.creating') : t('settings.serviceKeys.create')}
          </Button>
        </span>
      </form>
      {created === undefined ? null : (
        <Banner tone="warning" tag={t('settings.serviceKeys.secret.tag')} live>
          <span className="o-stack">
            <span>{t('settings.serviceKeys.secret.once', { name: created.name })}</span>
            <CopyField
              label={t('settings.serviceKeys.secret.label', { name: created.name })}
              value={created.secret}
            />
            <Button variant="ghost" onClick={view.dismiss}>
              {t('settings.serviceKeys.secret.done')}
            </Button>
          </span>
        </Banner>
      )}
      {view.changeFailure === undefined ? null : (
        <Banner tone="danger" tag={t('settings.serviceKeys.errorTag')} live>
          <FailureText failure={view.changeFailure} />
        </Banner>
      )}
      <LoadState data={view.keys} failure={view.failure} rows={2}>
        {(keys) =>
          keys.length === 0 ? (
            <p className="o-empty">{t('settings.serviceKeys.empty')}</p>
          ) : (
            <ul className="o-rows">
              {keys.map((key) => (
                <li key={key.id} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title">{key.name}</span>
                    <span className="o-row__meta">{key.scopes.map(scopeLabel).join(' · ')}</span>
                    <span className="o-row__meta">
                      {[
                        t('settings.serviceKeys.created', { date: day(key.createdAt) }),
                        key.expiresAt === undefined
                          ? t('settings.serviceKeys.noExpiry')
                          : t('settings.serviceKeys.expiresOn', { date: day(key.expiresAt) }),
                        key.lastUsedAt === undefined
                          ? t('settings.serviceKeys.neverUsed')
                          : t('settings.serviceKeys.used', { date: day(key.lastUsedAt) }),
                      ].join(' · ')}
                    </span>
                  </span>
                  <span className="o-row__end">
                    <ConfirmButton
                      label={t('settings.serviceKeys.delete')}
                      confirm={t('settings.serviceKeys.deleteConfirm', { name: key.name })}
                      keep={t('settings.serviceKeys.keep')}
                      disabled={locked}
                      onConfirm={() => {
                        view.remove(key);
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Section>
  );
}
