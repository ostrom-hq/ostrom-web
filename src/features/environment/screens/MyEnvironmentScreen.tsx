// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { CreateVariantForm } from '../components/CreateVariantForm';
import { VariantRow } from '../components/VariantRow';
import { useMyEnvironment, useMyEnvironmentChange } from '../useMyEnvironment';
import './environment.css';

/** What the person's agents receive, by name, and the values they declared for themselves. */
export function MyEnvironmentScreen(): ReactElement {
  const { t } = useTranslation();
  return <WithOrg title={t('environment.mine.title')}>{() => <MyEnvironment />}</WithOrg>;
}

function MyEnvironment(): ReactElement {
  const { t } = useTranslation();
  const view = useMyEnvironment();
  const change = useMyEnvironmentChange();
  return (
    <Screen title={t('environment.mine.title')} lead={t('environment.mine.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('environment.errorTag')} live>
          <FailureText failure={change.failure} />
        </Banner>
      )}
      <Section label={t('environment.mine.received.title')}>
        <LoadState data={view.received} failure={view.receivedFailure}>
          {(received) => (
            <div className="o-stack">
              {received.names.length === 0 ? (
                <p className="o-empty">{t('environment.mine.received.empty')}</p>
              ) : (
                <ul className="env-names" aria-label={t('environment.mine.received.title')}>
                  {received.names.map((name) => (
                    <li key={name} className="o-mono">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
              {received.unavailable.length === 0 ? null : (
                <Banner tone="warning" tag={t('environment.mine.received.unavailableTag')}>
                  {t('environment.mine.received.unavailable', { list: received.unavailable.join(', ') })}
                </Banner>
              )}
              <p className="o-row__meta">{t('environment.mine.received.hint')}</p>
            </div>
          )}
        </LoadState>
      </Section>
      <Section label={t('environment.mine.own.title')}>
        <p className="o-row__meta">{t('environment.mine.own.lead')}</p>
        <LoadState data={view.variants} failure={view.failure}>
          {(variants) =>
            variants.length === 0 ? (
              <p className="o-empty">{t('environment.mine.own.empty')}</p>
            ) : (
              <ul className="o-rows" aria-label={t('environment.mine.own.title')}>
                {variants.map((variant) => (
                  <VariantRow
                    key={variant.id}
                    variant={variant}
                    busy={change.pending}
                    bulkResult={undefined}
                    update={(next, onDone) => {
                      change.update(variant, next, onDone);
                    }}
                    remove={() => {
                      change.remove(variant);
                    }}
                    bulkAssign={undefined}
                    own
                  />
                ))}
              </ul>
            )
          }
        </LoadState>
      </Section>
      <CreateVariantForm create={change.create} pending={change.pending} personal />
    </Screen>
  );
}
