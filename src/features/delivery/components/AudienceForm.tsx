// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';

export interface AudienceFormProps {
  /** What the server says today: delivered to every member without an explicit decision. */
  readonly allMembers: boolean;
  readonly busy: boolean;
  readonly onSave: (allMembers: boolean) => void;
}

/** The audience switch: only members set to Yes, or all members except those set to No. */
export function AudienceForm({ allMembers, busy, onSave }: AudienceFormProps): ReactElement {
  const { t } = useTranslation();
  const [choice, setChoice] = useState(allMembers ? 'all' : 'assigned');
  const id = useId();
  return (
    <form
      className="o-inline"
      aria-label={t('delivery.audience.form')}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(choice === 'all');
      }}
    >
      <label htmlFor={id} className="o-field-label">
        {t('delivery.audience.label')}
      </label>
      <select
        id={id}
        className="o-input o-select"
        value={choice}
        onChange={(event) => {
          setChoice(event.target.value);
        }}
      >
        <option value="assigned">{t('delivery.audience.assigned')}</option>
        <option value="all">{t('delivery.audience.all')}</option>
      </select>
      <Button type="submit" disabled={busy || choice === (allMembers ? 'all' : 'assigned')}>
        {t('delivery.audience.save')}
      </Button>
    </form>
  );
}
