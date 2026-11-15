// SPDX-License-Identifier: Apache-2.0
import type { PoolSize } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatUsd } from '@/shared/lib/money';
import { formatAbsolute } from '@/shared/lib/time';
import { Banner } from '@/shared/ui/Banner';
import { Facts, Section } from '@/shared/ui/Screen';
import { reasonOf, sourceOf, statusOf, usdOfMicros } from '../model';

/** The daily budget in force, how it was sized, and what each shared account contributes. */
export function PoolSizeReport({ size }: { readonly size: PoolSize }): ReactElement {
  const { t, i18n } = useTranslation();
  const usd = (micros: number) => formatUsd(usdOfMicros(micros), i18n.language);
  const source = sourceOf(size);
  const reason = reasonOf(size);
  const automaticStale = size.enabled && source !== 'automatic' && reason === undefined;
  return (
    <>
      <Section label={t('poolSize.status.title')}>
        <p>
          {size.effectiveDailyMicros === undefined
            ? t('poolSize.status.none')
            : t('poolSize.status.effective', {
                amount: usd(size.effectiveDailyMicros),
                source: t(`poolSize.status.source.${source}`),
              })}
        </p>
        {reason === undefined ? null : (
          <Banner tag={t('poolSize.status.tag')}>{t(`poolSize.status.reason.${reason}`)}</Banner>
        )}
        {automaticStale ? <Banner tag={t('poolSize.status.tag')}>{t('poolSize.status.stale')}</Banner> : null}
        <Facts
          facts={[
            {
              label: t('poolSize.status.manual'),
              value:
                size.manualDailyMicros === undefined
                  ? t('poolSize.status.noneTyped')
                  : usd(size.manualDailyMicros),
            },
            {
              label: t('poolSize.status.automatic'),
              value:
                size.automaticDailyMicros === undefined || size.automaticComputedAt === undefined
                  ? t('poolSize.status.noneYet')
                  : t('poolSize.status.automaticAt', {
                      amount: usd(size.automaticDailyMicros),
                      when: formatAbsolute(size.automaticComputedAt, i18n.language),
                    }),
            },
            {
              label: t('poolSize.status.estimate'),
              value: t('poolSize.status.estimateLeft', { amount: usd(size.estimatedDailyMicros) }),
            },
            {
              label: t('poolSize.status.capacity'),
              value: size.accounts.every((account) => account.capacityDailyMicros === undefined)
                ? t('poolSize.status.capacityUnknown')
                : size.capacityUnknownAccounts > 0
                  ? t('poolSize.status.capacityAtLeast', {
                      amount: usd(size.capacityDailyMicros),
                      count: size.capacityUnknownAccounts,
                    })
                  : t('poolSize.accounts.daily', { amount: usd(size.capacityDailyMicros) }),
            },
            {
              label: t('poolSize.status.outside'),
              value:
                size.outsideWeeklyMicros === undefined
                  ? t('poolSize.status.outsideUnknown')
                  : usd(size.outsideWeeklyMicros),
            },
          ]}
        />
        {size.unpricedModels.length === 0 ? null : (
          <p className="o-row__meta">
            {t('poolSize.status.unpriced', { models: size.unpricedModels.join(', ') })}
          </p>
        )}
      </Section>
      <Section label={t('poolSize.accounts.title')}>
        {size.accounts.length === 0 ? (
          <p className="o-empty">{t('poolSize.accounts.empty')}</p>
        ) : (
          <ul className="o-card o-rows">
            {size.accounts.map((account) => (
              <li key={account.accountId} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title o-mono">{account.accountId}</span>
                  <span className="o-row__meta">
                    {t(`poolSize.accounts.status.${statusOf(account)}`)}
                    {statusOf(account) === 'counted'
                      ? ` · ${t('poolSize.accounts.daily', { amount: usd(account.dailyMicros) })}${
                          account.binding === undefined
                            ? ''
                            : ` · ${t('poolSize.accounts.boundBy', { window: account.binding })}`
                        }`
                      : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {size.models.length === 0 ? null : (
        <Section label={t('poolSize.models.title')}>
          <ul className="o-card o-rows">
            {size.models.map((model) => (
              <li key={`${model.provider}:${model.model}`} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title o-mono">{model.model}</span>
                  <span className="o-row__meta">
                    {t('poolSize.models.row', {
                      tokens: new Intl.NumberFormat(i18n.language).format(
                        model.inputTokens +
                          model.cacheWriteTokens +
                          model.cacheReadTokens +
                          model.outputTokens,
                      ),
                      cost:
                        model.totalMicros === undefined
                          ? t('poolSize.models.unpriced')
                          : usd(model.totalMicros),
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
