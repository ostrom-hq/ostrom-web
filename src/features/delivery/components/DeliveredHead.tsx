// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { memberLabel } from '../model';
import type { DeliveredMember } from '../useMemberDelivery';

/** Whose view it is: the viewer's own, or a member's. */
export function DeliveredLead({
  who,
  memberId,
}: {
  readonly who: DeliveredMember;
  readonly memberId: string;
}): ReactElement {
  const { t } = useTranslation();
  if (who.mine) return <>{t('delivery.member.mine')}</>;
  return (
    <>{t('delivery.member.of', { who: who.member === undefined ? memberId : memberLabel(who.member) })}</>
  );
}

export function BackToCatalog({
  who,
  to,
}: {
  readonly who: DeliveredMember;
  readonly to: 'skills' | 'hooks';
}): ReactElement | null {
  const { t } = useTranslation();
  if (!who.canManage) return null;
  return to === 'skills' ? (
    <Link to="/skills" className="o-back">
      {t('delivery.skills.back')}
    </Link>
  ) : (
    <Link to="/hooks" className="o-back">
      {t('delivery.hooks.back')}
    </Link>
  );
}
