// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { OrgChoice } from '@/shared/org/orgStore';
import { Avatar } from '@/shared/ui/Avatar';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';

export interface OrgPickerProps {
  readonly choices: readonly OrgChoice[];
  readonly currentId: string | undefined;
  /** False when the id typed is not one: the picker stays open and says so. */
  readonly onChoose: (id: string) => boolean;
  readonly onClose: () => void;
}

/**
 * Which organization the console acts in. It lists the organizations the server already named; the contract has no
 * list of a person's own organizations yet (QUESTIONS 10:45 WEB), so an id can also be typed.
 */
export function OrgPicker({ choices, currentId, onChoose, onClose }: OrgPickerProps): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [invalid, setInvalid] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const fieldId = useId();
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="o-org-picker">
      <div
        ref={panel}
        className="o-org-picker__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="o-org-picker__title">
          {t('orgs.picker.title')}
        </h2>
        <p className="o-org-picker__body">{t('orgs.picker.body')}</p>
        {choices.length > 0 ? (
          <ul className="o-org-picker__list" aria-label={t('orgs.picker.known')}>
            {choices.map((choice) => (
              <li key={choice.id}>
                <Button
                  aria-current={choice.id === currentId ? 'true' : undefined}
                  onClick={() => {
                    onChoose(choice.id);
                  }}
                >
                  <Avatar login={choice.name} size={22} />
                  <span>{choice.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="o-stack"
          onSubmit={(event) => {
            event.preventDefault();
            setInvalid(!onChoose(typed));
          }}
        >
          <label htmlFor={fieldId} className="o-field-label">
            {t('orgs.picker.idLabel')}
          </label>
          <input
            id={fieldId}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            aria-invalid={invalid}
            onChange={(event) => {
              setTyped(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid ? (
            <Banner tone="warning" tag={t('orgs.picker.problemTag')} live>
              {t('orgs.picker.invalid')}
            </Banner>
          ) : null}
          <div className="o-inline">
            <Button type="submit">{t('orgs.picker.use')}</Button>
            <Button variant="ghost" onClick={onClose}>
              {t('orgs.picker.notNow')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
