// SPDX-License-Identifier: Apache-2.0
import type { EnvironmentVariant } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { valueState } from '../model';

export interface PersonalReviewRowProps {
  readonly variant: EnvironmentVariant;
  /** Who owns it, by name when the member list says. */
  readonly owner: string;
  /** Whether its owner receives it: an administrator's assignment or an exclusion leaves it unassigned. */
  readonly assigned: boolean;
  readonly busy: boolean;
  readonly promote: () => void;
  readonly remove: () => void;
}

/**
 * A member's personal variant, for review: its definition and whether a value is stored, never the value. An
 * administrator promotes it to the team or deletes it; they cannot edit or assign it.
 */
export function PersonalReviewRow({
  variant,
  owner,
  assigned,
  busy,
  promote,
  remove,
}: PersonalReviewRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const label = `${variant.variable}: ${variant.name}`;
  return (
    <li className="o-row env-row">
      <span className="o-row__main">
        <span className="o-inline">
          <span className="o-row__title o-mono">{variant.variable}</span>
          <span>{variant.name}</span>
        </span>
        <span className="o-row__meta">
          {[
            t('environment.personal.owner', { who: owner }),
            t('environment.variant.version', { version: variant.version }),
            t(`environment.variant.value.${valueState(variant)}`),
            t('environment.variant.updated', { at: formatAbsolute(variant.updatedAt, i18n.language) }),
          ].join(' · ')}
        </span>
        {assigned ? null : <span className="o-row__meta">{t('environment.personal.unassigned')}</span>}
      </span>
      <span className="o-row__end o-inline">
        <ConfirmButton
          tone="secondary"
          label={t('environment.review.promote')}
          confirm={t('environment.review.promoteConfirm', { what: label })}
          keep={t('environment.keep')}
          disabled={busy}
          onConfirm={promote}
        />
        <ConfirmButton
          label={t('environment.remove')}
          confirm={t('environment.removeConfirm', { what: label })}
          keep={t('environment.keep')}
          disabled={busy}
          onConfirm={remove}
        />
      </span>
    </li>
  );
}
