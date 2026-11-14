// SPDX-License-Identifier: Apache-2.0
import type { SkillEntry } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { type SkillChangeViewModel, isPersonal } from '../useSkills';

/** The gestures on the skill itself: unpin, remove from the catalog or restore it, or promote a personal one. */
export function SkillControls({
  skill,
  change,
}: {
  readonly skill: SkillEntry;
  readonly change: SkillChangeViewModel;
}): ReactElement {
  const { t } = useTranslation();
  if (isPersonal(skill))
    return (
      <div className="o-inline">
        <ConfirmButton
          tone="secondary"
          label={t('delivery.skills.promote')}
          confirm={t('delivery.skills.promoteConfirm', { name: skill.name })}
          keep={t('delivery.keep')}
          disabled={change.pending}
          onConfirm={change.promote}
        />
      </div>
    );
  if (skill.retired)
    return (
      <div className="o-inline">
        <Button disabled={change.pending} onClick={change.restore}>
          {t('delivery.skills.restore')}
        </Button>
      </div>
    );
  return (
    <div className="o-inline">
      {skill.pinnedVersion === undefined || skill.pinnedVersion === null ? null : (
        <Button disabled={change.pending} onClick={change.unpin}>
          {t('delivery.unpin')}
        </Button>
      )}
      <ConfirmButton
        label={t('delivery.skills.retire')}
        confirm={t('delivery.skills.retireConfirm', { name: skill.name })}
        keep={t('delivery.keep')}
        disabled={change.pending}
        onConfirm={change.retire}
      />
    </div>
  );
}
