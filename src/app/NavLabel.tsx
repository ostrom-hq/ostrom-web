// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useWaitBadge } from '@/features/waits/route';
import { Badge } from '@/shared/ui/Badge';
import type { NAV_LINKS } from './navigation';

/** The words of a navigation entry; "Waiting for you" also says how many are waiting for the viewer. */
export function NavLabel({ label }: { readonly label: (typeof NAV_LINKS)[number]['label'] }): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      {t(`app.nav.${label}`)}
      {label === 'waits' ? <WaitsCount /> : null}
    </>
  );
}

function WaitsCount(): ReactElement | null {
  const { t } = useTranslation();
  const badge = useWaitBadge();
  if (badge === undefined) return null;
  return (
    <>
      {' '}
      <Badge tone="signal" approval="waiting">
        <span aria-hidden="true">{badge.label}</span>
        <span className="o-visually-hidden">
          {t('waits.nav.open', { label: badge.label, count: badge.count })}
        </span>
      </Badge>
    </>
  );
}
