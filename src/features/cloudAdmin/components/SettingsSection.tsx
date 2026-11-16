// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import { automationsOf, minutesOf, REMOTE_IDLE_DEFAULT, remoteIdleOf } from '../model';
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
            automations={settings.maxRunningAutomationsPerMember}
            remoteIdle={settings.remoteIdleTimeoutMinutes ?? REMOTE_IDLE_DEFAULT}
            updatedAt={settings.updatedAt ?? undefined}
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
  remoteIdle,
  updatedAt,
  view,
}: {
  readonly minutes: number;
  readonly automations: number;
  readonly remoteIdle: number;
  readonly updatedAt: string | undefined;
  readonly view: ReturnType<typeof useCloudSettings>;
}): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState(String(minutes));
  const [typedAutomations, setTypedAutomations] = useState(String(automations));
  const [typedRemote, setTypedRemote] = useState(String(remoteIdle));
  const [touched, setTouched] = useState(false);
  // Remote sessions only where the server has them (TeamCode's "Remote sessions" fieldset).
  const remote = useAnnounced('runners.cloud.remote.v1');
  const parsed = minutesOf(typed);
  const parsedAutomations = automationsOf(typedAutomations);
  const parsedRemote = remoteIdleOf(typedRemote);
  const { write } = view;
  // A cap left as it was read is not checked: the server's own value is not the person's to fix.
  const automationsChanged = typedAutomations !== String(automations);
  const remoteChanged = remote && typedRemote !== String(remoteIdle);
  const problem =
    parsed === undefined
      ? t('cloudAdmin.settings.background')
      : parsedAutomations === undefined && automationsChanged
        ? t('cloudAdmin.settings.automations')
        : parsedRemote === undefined && remoteChanged
          ? t('cloudAdmin.settings.remoteIdle')
          : undefined;
  return (
    <form
      className="o-stack ca-settings"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (parsed === undefined || problem !== undefined) return;
        // A cap goes only when it was changed: absent keeps what is stored, so another admin's cap is not undone.
        view.save({
          minutes: parsed,
          ...(automationsChanged && parsedAutomations !== undefined
            ? { automations: parsedAutomations }
            : {}),
          ...(remoteChanged && parsedRemote !== undefined ? { remoteIdle: parsedRemote } : {}),
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
      {remote ? (
        <fieldset className="o-stack">
          <legend className="o-field-label">{t('cloudAdmin.settings.remote')}</legend>
          <p className="o-row__meta">{t('cloudAdmin.settings.remoteLead')}</p>
          <Field
            label={t('cloudAdmin.settings.remoteIdle')}
            type="number"
            value={typedRemote}
            disabled={!view.canEdit || write.saving}
            hint={t('cloudAdmin.settings.remoteIdleHint')}
            onChange={(next) => {
              write.clear();
              setTouched(true);
              setTypedRemote(next);
            }}
          />
        </fieldset>
      ) : null}
      <InvalidHint label={problem} shown={touched} />
      {view.canEdit ? (
        <div className="o-inline">
          <Button
            type="submit"
            disabled={
              write.saving ||
              (updatedAt !== undefined &&
                parsed === minutes &&
                parsedAutomations === automations &&
                !remoteChanged)
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
