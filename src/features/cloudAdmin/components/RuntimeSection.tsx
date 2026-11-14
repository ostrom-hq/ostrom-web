// SPDX-License-Identifier: Apache-2.0
import type { CloudRuntime } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  type RuntimeDraft,
  runtimeDraftOf,
  runtimeProblem,
  runtimeRequestOf,
  TRANSFERS,
  WORKSPACE_MODES,
} from '../model';
import { type CloudRuntimeViewModel, useCloudRuntime } from '../useCloudAdmin';
import { Choice, Field } from './Field';
import { SaveOutcome } from './SaveOutcome';

/** How cloud sessions run on this instance. Only mounted for an administrator of the instance. */
export function RuntimeSection(): ReactElement {
  const { t } = useTranslation();
  const view = useCloudRuntime();
  return (
    <Section label={t('cloudAdmin.runtime.title')}>
      <LoadState data={view.runtime} failure={view.failure} rows={3}>
        {(runtime) => (
          <RuntimeForm key={runtime.updatedAt ?? 'stored-nothing'} runtime={runtime} view={view} />
        )}
      </LoadState>
    </Section>
  );
}

function RuntimeForm({
  runtime,
  view,
}: {
  readonly runtime: CloudRuntime;
  readonly view: CloudRuntimeViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RuntimeDraft>(() => runtimeDraftOf(runtime));
  const { write } = view;
  const problem = runtimeProblem(draft);
  const edit = (change: Partial<RuntimeDraft>): void => {
    write.clear();
    setDraft({ ...draft, ...change });
  };
  const disabled = write.saving;
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem === undefined) view.save(runtimeRequestOf(draft, runtime), () => undefined);
      }}
    >
      <label className="o-inline">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={disabled}
          onChange={(event) => {
            edit({ enabled: event.target.checked });
          }}
        />
        {t('cloudAdmin.runtime.enabled')}
      </label>
      <p className="o-row__meta">{t('cloudAdmin.runtime.enabledHint')}</p>
      <Field
        label={t('cloudAdmin.runtime.runnerImage')}
        value={draft.runnerImage}
        disabled={disabled}
        maxLength={512}
        onChange={(runnerImage) => {
          edit({ runnerImage });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.runnerBinary')}
        value={draft.runnerBinary}
        disabled={disabled}
        maxLength={256}
        onChange={(runnerBinary) => {
          edit({ runnerBinary });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.serverUrl')}
        value={draft.serverUrl}
        disabled={disabled}
        maxLength={512}
        hint={t('cloudAdmin.runtime.serverUrlHint', { url: runtime.effectiveServerUrl })}
        onChange={(serverUrl) => {
          edit({ serverUrl });
        }}
      />
      <Choice
        label={t('cloudAdmin.runtime.workspaceAccessMode')}
        value={draft.workspaceAccessMode}
        options={WORKSPACE_MODES.map((mode) => ({ value: mode, label: mode }))}
        disabled={disabled}
        onChange={(workspaceAccessMode) => {
          edit({ workspaceAccessMode });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.pausedRetentionDays')}
        type="number"
        value={draft.pausedRetentionDays}
        disabled={disabled}
        onChange={(pausedRetentionDays) => {
          edit({ pausedRetentionDays });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.failedWorkspaceRetentionDays')}
        type="number"
        value={draft.failedWorkspaceRetentionDays}
        disabled={disabled}
        onChange={(failedWorkspaceRetentionDays) => {
          edit({ failedWorkspaceRetentionDays });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.maxRunningSessionsPerMember')}
        type="number"
        value={draft.maxRunningSessionsPerMember}
        disabled={disabled}
        onChange={(maxRunningSessionsPerMember) => {
          edit({ maxRunningSessionsPerMember });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.maxRetainedSessionsPerMember')}
        type="number"
        value={draft.maxRetainedSessionsPerMember}
        disabled={disabled}
        onChange={(maxRetainedSessionsPerMember) => {
          edit({ maxRetainedSessionsPerMember });
        }}
      />
      <Field
        label={t('cloudAdmin.runtime.transcriptRetentionDays')}
        type="number"
        value={draft.transcriptRetentionDays}
        disabled={disabled}
        onChange={(transcriptRetentionDays) => {
          edit({ transcriptRetentionDays });
        }}
      />
      <Choice
        label={t('cloudAdmin.runtime.memberTransfers')}
        value={draft.memberTransfers}
        options={TRANSFERS.map((mode) => ({ value: mode, label: t(`cloudAdmin.runtime.transfers.${mode}`) }))}
        disabled={disabled}
        onChange={(memberTransfers) => {
          edit({ memberTransfers });
        }}
      />
      {problem === undefined ? null : (
        <p className="o-row__meta" role="status">
          {t('cloudAdmin.invalidField', { field: problem })}
        </p>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={write.saving || problem !== undefined}>
          {write.saving ? t('cloudAdmin.saving') : t('cloudAdmin.save')}
        </Button>
      </div>
      <SaveOutcome
        write={write}
        saved={t('cloudAdmin.runtime.saved')}
        onReload={() => {
          void view.reload();
        }}
      />
    </form>
  );
}
