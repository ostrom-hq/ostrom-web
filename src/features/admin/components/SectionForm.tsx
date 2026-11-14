// SPDX-License-Identifier: Apache-2.0
import type { InstanceSettings } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { Section } from '@/shared/ui/Screen';
import {
  draftOf,
  isChanged,
  isConfigured,
  intentOf,
  isSettingsConflict,
  requestOf,
  type SectionDraft,
  valueOf,
  VALUE_MAX,
} from '../model';
import type { SaveSectionViewModel } from '../useAdmin';
import { SecretField } from './SecretField';

export interface SectionFormProps {
  readonly settings: InstanceSettings;
  readonly save: SaveSectionViewModel;
  /** Reads the section again: what a person does when someone saved it first. */
  readonly onReload: () => void;
}

/** One section of the instance's settings, its form generated from the fields the server lists. */
export function SectionForm({ settings, save, onReload }: SectionFormProps): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SectionDraft>(() => draftOf(settings));
  const [saved, setSaved] = useState(false);
  // The section read again (a reload, a save, another administrator's): the form starts afresh from it.
  const [seen, setSeen] = useState(settings.version);
  if (seen !== settings.version) {
    setSeen(settings.version);
    setDraft(draftOf(settings));
  }
  const idBase = useId();
  const changed = isChanged(settings, draft);
  const conflict = isSettingsConflict(save.failure);
  return (
    <Section label={settings.section} id={`settings-${settings.section}`}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          save.save(settings.section, requestOf(settings, draft), () => {
            setSaved(true);
          });
        }}
      >
        {settings.importedFromEnvironment ? (
          <Banner tone="info" tag={t('admin.settings.importedTag')}>
            {t('admin.settings.imported')}
          </Banner>
        ) : null}
        {settings.fields.map((field) => {
          if (field.secret)
            return (
              <SecretField
                key={field.name}
                name={field.name}
                required={field.required}
                configured={isConfigured(settings, field.name)}
                intent={intentOf(draft, field.name)}
                disabled={save.saving}
                onChange={(next) => {
                  setSaved(false);
                  setDraft({ ...draft, secrets: { ...draft.secrets, [field.name]: next } });
                }}
              />
            );
          const inputId = `${idBase}-${field.name}`;
          return (
            <div key={field.name} className="o-stack">
              <label htmlFor={inputId} className="o-field-label">
                {field.name}
                {field.required ? <span className="o-row__meta"> {t('admin.settings.required')}</span> : null}
              </label>
              <input
                id={inputId}
                className="o-input"
                autoComplete="off"
                maxLength={VALUE_MAX}
                value={valueOf(draft, field.name)}
                disabled={save.saving}
                onChange={(event) => {
                  setSaved(false);
                  setDraft({ ...draft, values: { ...draft.values, [field.name]: event.target.value } });
                }}
              />
            </div>
          );
        })}
        <div className="o-inline">
          <Button type="submit" disabled={save.saving || !changed}>
            {save.saving ? t('admin.settings.saving') : t('admin.settings.save')}
          </Button>
          <span className="o-row__meta">{t('admin.settings.version', { version: settings.version })}</span>
        </div>
      </form>
      {saved && save.failure === undefined ? (
        <Banner tone="info" tag={t('admin.settings.savedTag')} live>
          {t('admin.settings.saved', { section: settings.section })}
        </Banner>
      ) : null}
      {save.failure === undefined ? null : (
        <Banner tone="danger" tag={t('admin.settings.errorTag')} live>
          {conflict ? (
            <>
              {t('admin.settings.conflict')}{' '}
              <Button
                variant="secondary"
                onClick={() => {
                  save.clear();
                  onReload();
                }}
              >
                {t('admin.settings.reload')}
              </Button>
            </>
          ) : (
            <FailureText failure={save.failure} />
          )}
        </Banner>
      )}
    </Section>
  );
}
