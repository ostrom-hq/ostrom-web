// SPDX-License-Identifier: Apache-2.0
import type { Group } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Section } from '@/shared/ui/Screen';
import { GROUP_NAME_MAX } from '../groups';
import type { GroupChangeViewModel } from '../useGroups';

export interface GroupSettingsProps {
  readonly group: Group;
  readonly change: GroupChangeViewModel;
  /** Once the server deleted it. */
  readonly onDeleted: () => void;
}

/** An owner's or an admin's: a new name, or the group deleted (its subscriptions stay, lent by it no more). */
export function GroupSettings({ group, change, onDeleted }: GroupSettingsProps): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState(group.name);
  const nameId = useId();
  const trimmed = name.trim();
  return (
    <Section label={t('sharing.groups.settings')}>
      <form
        className="o-inline"
        onSubmit={(event) => {
          event.preventDefault();
          change.rename(group.id, trimmed, () => {
            setName(trimmed);
          });
        }}
      >
        <label htmlFor={nameId} className="o-field-label">
          {t('sharing.groups.rename')}
        </label>
        <input
          id={nameId}
          className="o-input"
          autoComplete="off"
          maxLength={GROUP_NAME_MAX}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button type="submit" disabled={change.pending || trimmed === '' || trimmed === group.name}>
          {t('sharing.groups.renameSubmit')}
        </Button>
      </form>
      <div className="o-inline">
        <ConfirmButton
          label={t('sharing.groups.delete')}
          confirm={t('sharing.groups.deleteConfirm', { name: group.name })}
          keep={t('sharing.keep')}
          disabled={change.pending}
          onConfirm={() => {
            change.drop(group.id, onDeleted);
          }}
        />
      </div>
    </Section>
  );
}
