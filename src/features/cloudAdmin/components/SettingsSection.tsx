// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import { automationsOf, DEFAULT_AUTOMATIONS, minutesOf } from '../model';
import { useCloudSettings } from '../useCloudAdmin';
import { SaveOutcome } from './SaveOutcome';
import { Field } from './Field';
import { InvalidHint } from './InvalidHint';

/** The organization's cloud settings: owners and admins write them, everyone else reads them. */
export function SettingsSection(): ReactElement {
  const { t } = useTranslation();
  const view = useCloudSettings();
  return (
    <Section label={t('cloudAdmin.settings.title')}>
      <LoadState data={view.settings} failure={view.failure} rows={1}>
        {(settings) => (
          <SettingsForm
            // A settings read again (a save, a reload) starts the form afresh from it.
            key={settings.updatedAt ?? 'stored-nothing'}
            minutes={settings.backgroundWorkMaxMinutes}
            automations={settings.maxRunningAutomationsPerMember ?? DEFAULT_AUTOMATIONS}
            updatedAt={settings.updatedAt}
            view={view}
          />
        )}
      </LoadState>
    </Section>
  );
}

function SettingsForm({
  minutes,
  automations,
  updatedAt,
  view,
}: {
  readonly minutes: number;
  readonly automations: number;
  readonly updatedAt: string | undefined;
  readonly view: ReturnType<typeof useCloudSettings>;
}): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState(String(minutes));
  const [typedAutomations, setTypedAutomations] = useState(String(automations));
  const [touched, setTouched] = useState(false);
  const parsed = minutesOf(typed);
  const parsedAutomations = automationsOf(typedAutomations);
  const { write } = view;
  // A cap left as it was read is not checked: the server's own value is not the person's to fix.
  const automationsChanged = typedAutomations !== String(automations);
  const problem =
    parsed === undefined
      ? t('cloudAdmin.settings.background')
      : parsedAutomations === undefined && automationsChanged
        ? t('cloudAdmin.settings.automations')
        : undefined;
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (parsed === undefined || (parsedAutomations === undefined && automationsChanged)) return;
        // The cap goes only when it was changed: absent keeps what is stored, so another admin's cap is not undone.
        view.save({
          minutes: parsed,
          ...(automationsChanged && parsedAutomations !== undefined
            ? { automations: parsedAutomations }
            : {}),
        });
      }}
    >
      <Field
        label={t('cloudAdmin.settings.background')}
        type="number"
        value={typed}
        disabled={!view.canEdit || write.saving}
        hint={t('cloudAdmin.settings.backgroundHint')}
        onChange={(next) => {
          write.clear();
          setTouched(true);
          setTyped(next);
        }}
      />
      <Field
        label={t('cloudAdmin.settings.automations')}
        type="number"
        value={typedAutomations}
        disabled={!view.canEdit || write.saving}
        hint={t('cloudAdmin.settings.automationsHint')}
        onChange={(next) => {
          write.clear();
          setTouched(true);
          setTypedAutomations(next);
        }}
      />
      <InvalidHint label={problem} shown={touched} />
      {view.canEdit ? (
        <div className="o-inline">
          <Button
            type="submit"
            disabled={
              write.saving ||
              (updatedAt !== undefined && parsed === minutes && parsedAutomations === automations)
            }
          >
            {write.saving ? t('cloudAdmin.saving') : t('cloudAdmin.save')}
          </Button>
          {updatedAt === undefined ? (
            <span className="o-row__meta">{t('cloudAdmin.settings.default')}</span>
          ) : null}
        </div>
      ) : (
        <p className="o-row__meta">{t('cloudAdmin.settings.readOnly')}</p>
      )}
      <SaveOutcome
        write={write}
        saved={t('cloudAdmin.settings.saved')}
        onReload={() => {
          void view.reload();
        }}
      />
    </form>
  );
}
