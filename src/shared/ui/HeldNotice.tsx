// SPDX-License-Identifier: Apache-2.0
import type { GovernanceConfirmationPending } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from './Banner';

/** A write the server held for a governance confirmation instead of applying it: where to confirm it. */
export function HeldNotice({
  held,
}: {
  readonly held: GovernanceConfirmationPending | undefined;
}): ReactElement | null {
  const { t } = useTranslation();
  if (held === undefined) return null;
  return (
    <Banner tone="warning" tag={t('app.held.tag')} live>
      {t('app.held.text')}{' '}
      <Link to="/confirm/$confirmationId" params={{ confirmationId: held.confirmationId }}>
        {t('app.held.open')}
      </Link>
    </Banner>
  );
}
