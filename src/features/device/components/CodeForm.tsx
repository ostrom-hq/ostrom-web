// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';

export interface CodeFormProps {
  /** Reads the login of the code typed. */
  readonly onRead: (typed: string) => void;
}

/** The code `ostrom login` shows in the terminal, typed by hand when its link was not opened. */
export function CodeForm({ onRead }: CodeFormProps): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  return (
    <form
      className="o-card o-section o-stack"
      aria-label={t('device.form.label')}
      onSubmit={(event) => {
        event.preventDefault();
        onRead(typed);
      }}
    >
      <label htmlFor={fieldId} className="o-field-label">
        {t('device.form.field')}
      </label>
      <input
        id={fieldId}
        className="o-input o-mono o-device__input"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={t('device.form.placeholder')}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <div>
        <Button type="submit" disabled={typed.trim() === ''}>
          {t('device.form.submit')}
        </Button>
      </div>
    </form>
  );
}
