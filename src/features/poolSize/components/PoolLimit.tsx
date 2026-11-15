// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatUsd } from '@/shared/lib/money';
import { Section } from '@/shared/ui/Screen';
import { sourceOf, usdOfMicros } from '../model';
import { usePoolSize } from '../usePoolSize';

/**
 * The organization's daily limit in force on /spend (`GET /pools/size`): the automatic amount while the automatic pool
 * size is on and fresh, else the typed one. The Spend page loads it only for owners and admins where the server serves
 * `capacity.poolsize.v1`, so the page that does not show it never downloads it.
 */
export function PoolLimit(): ReactElement | null {
  const { t, i18n } = useTranslation();
  const { size } = usePoolSize(true);
  const effective = size?.effectiveDailyMicros ?? undefined;
  if (size === undefined || effective === undefined) return null;
  const amount = formatUsd(usdOfMicros(effective), i18n.language);
  return (
    <Section label={t('poolLimit.title')}>
      <p>
        {t(sourceOf(size) === 'automatic' ? 'poolLimit.automatic' : 'poolLimit.manual', { amount })}{' '}
        <Link to="/pool-size">{t('poolLimit.link')}</Link>
      </p>
    </Section>
  );
}
