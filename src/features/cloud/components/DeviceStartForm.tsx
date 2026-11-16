// SPDX-License-Identifier: Apache-2.0
import type { ResumableSessionDto } from '@gen/api/types.gen';
import { type ReactElement, useId } from 'react';
import { systemOf } from '@/features/cloudHost';
import type { TFunction } from '@/shared/i18n/instance';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { deviceFailureText } from '../deviceWords';
import { DEVICE_AGENTS, PERMISSION_MODES } from '../remote';
import type { DeviceStartViewModel } from '../useDeviceStart';

/** "2 h ago · 5 messages". */
function resumableMeta(t: TFunction, session: ResumableSessionDto, now: Date, language: string): string {
  return `${formatRelative(session.lastActiveAt, now, language)} · ${t('cloud.remote.start.turns', { count: session.turns })}`;
}

/**
 * "Resume a session", under the folder: closed and set to None by default; opened, it lists the folder's Claude Code
 * conversations the device read now (title, how long ago, how many messages). Another folder or device clears it.
 */
function ResumeFields({
  view,
  device,
}: {
  readonly view: DeviceStartViewModel;
  readonly device: string;
}): ReactElement | null {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const { state } = view;
  if (!view.showsResume) return null;
  const chosen = state.resumable?.find((item) => item.id === state.resumeId);
  return (
    <div className="o-stack" role="group" aria-label={t('cloud.remote.start.resume')}>
      <span className="o-field-label">{t('cloud.remote.start.resume')}</span>
      {!state.deviceResumes ? (
        <p className="o-row__meta">{t('cloud.remote.start.resumeOldDaemon', { device })}</p>
      ) : (
        <>
          <Button
            variant="ghost"
            aria-expanded={state.resumeOpen}
            disabled={view.creating}
            onClick={view.onResumeOpen}
          >
            {chosen === undefined
              ? `${t('cloud.remote.start.resumeNone')} · ${t('cloud.remote.start.resumeNoneHint')}`
              : `${chosen.title} · ${resumableMeta(t, chosen, now, i18n.language)}`}
          </Button>
          {!state.resumeOpen ? null : (
            <div className="o-stack">
              {state.loadingResumable && state.resumable === undefined ? (
                <p className="o-row__meta" role="status">
                  {t('cloud.remote.start.resumeLoading')}
                </p>
              ) : null}
              {state.resumableError === undefined ? null : (
                <p className="cl-recipe__problem" role="alert">
                  {deviceFailureText(t, state.resumableError)}{' '}
                  <Button variant="ghost" onClick={view.onResumeRetry}>
                    {t('cloud.remote.start.retry')}
                  </Button>
                </p>
              )}
              {state.resumable === undefined ? null : (
                <fieldset className="o-stack">
                  <legend className="o-field-label">{t('cloud.remote.start.resume')}</legend>
                  <label className="o-inline">
                    <input
                      type="radio"
                      name="resume"
                      checked={state.resumeId === undefined}
                      onChange={() => {
                        view.onResume(undefined);
                      }}
                    />
                    {`${t('cloud.remote.start.resumeNone')} · ${t('cloud.remote.start.resumeNoneHint')}`}
                  </label>
                  {state.resumable.map((session) => (
                    <label key={session.id} className="o-inline">
                      <input
                        type="radio"
                        name="resume"
                        checked={state.resumeId === session.id}
                        onChange={() => {
                          view.onResume(session.id);
                        }}
                      />
                      {`${session.title} · ${resumableMeta(t, session, now, i18n.language)}`}
                    </label>
                  ))}
                  {state.resumable.length === 0 && state.resumableError === undefined ? (
                    <p className="o-row__meta">{t('cloud.remote.start.resumeEmpty')}</p>
                  ) : null}
                  {state.more === undefined ? null : (
                    <Button variant="ghost" disabled={state.loadingResumable} onClick={view.onResumeMore}>
                      {t('cloud.remote.start.resumeMore')}
                    </Button>
                  )}
                </fieldset>
              )}
            </div>
          )}
          <p className="o-row__meta">{t('cloud.remote.start.resumeHint', { device })}</p>
        </>
      )}
    </div>
  );
}

/**
 * A session on one of the member's online devices: TeamCode's companion `NewSessionSheet`, its device fields. The
 * online devices only, then the folders the chosen one offers: never a path typed here.
 */
export function DeviceStartForm({ view }: { readonly view: DeviceStartViewModel }): ReactElement {
  const { t } = useTranslation();
  const { state } = view;
  const ids = { name: useId(), message: useId(), model: useId(), effort: useId() };
  const chosen = state.devices?.find((device) => device.id === state.deviceId);
  // The device's own name, also in sentences ("Start on Ada's Mac"); "This device" marks it in the list only.
  const device = chosen?.name ?? t('cloudHost.host.fallback');
  return (
    <form
      className="o-stack cl-form"
      aria-label={t('cloud.remote.start.target.device')}
      onSubmit={(event) => {
        event.preventDefault();
        view.create();
      }}
    >
      <fieldset className="o-stack">
        <legend className="o-field-label">{t('cloud.remote.start.device')}</legend>
        <span className="o-inline">
          <Button variant="ghost" disabled={state.loadingDevices || view.creating} onClick={view.loadDevices}>
            {t('cloud.remote.start.refresh')}
          </Button>
        </span>
        {state.loadingDevices ? (
          <p className="o-row__meta" role="status">
            {t('cloud.remote.start.devicesLoading')}
          </p>
        ) : state.devices?.length === 0 ? (
          <p className="o-row__meta">{t('cloud.remote.start.noDevice')}</p>
        ) : null}
        {(state.devices ?? []).map((item) => {
          const system = systemOf(item.platform, item.osVersion);
          const subtitle = [item.current === true ? t('cloud.remote.start.deviceThis') : undefined, system]
            .filter((part) => part !== undefined)
            .join(' · ');
          return (
            <label key={item.id} className="o-inline">
              <input
                type="radio"
                name="device"
                checked={state.deviceId === item.id}
                onChange={() => {
                  view.onDevice(item.id);
                }}
              />
              <span className="o-row__title">{item.name}</span>
              {subtitle === '' ? null : <span className="o-row__meta">{subtitle}</span>}
            </label>
          );
        })}
      </fieldset>
      {state.deviceId === undefined ? null : (
        <fieldset className="o-stack">
          <legend className="o-field-label">{t('cloud.remote.start.folder')}</legend>
          {state.loadingFolders ? (
            <p className="o-row__meta" role="status">
              {t('cloud.remote.start.foldersLoading')}
            </p>
          ) : state.folders?.length === 0 && state.error === undefined ? (
            <p className="o-row__meta">{t('cloud.remote.start.noFolder')}</p>
          ) : null}
          {(state.folders ?? []).map((folder) => (
            <label key={folder.id} className="o-inline">
              <input
                type="radio"
                name="folder"
                checked={state.folderId === folder.id}
                onChange={() => {
                  view.onFolder(folder.id);
                }}
              />
              <span className="o-row__title">{folder.name}</span>
              {folder.label === undefined || folder.label === null || folder.label === folder.name ? null : (
                <span className="o-row__meta">{folder.label}</span>
              )}
            </label>
          ))}
          {state.folders === undefined || state.folders.length === 0 ? null : (
            <p className="o-row__meta">{t('cloud.remote.start.folderHint')}</p>
          )}
        </fieldset>
      )}
      <ResumeFields view={view} device={device} />
      <div className="o-inline" role="group" aria-label={t('cloud.remote.start.agent')}>
        <span className="o-field-label">{t('cloud.remote.start.agent')}</span>
        {DEVICE_AGENTS.map((agent) => (
          <Button
            key={agent}
            variant="ghost"
            aria-pressed={state.agent === agent}
            onClick={() => {
              view.onAgent(agent);
            }}
          >
            {t(`cloud.agent.${agent}`)}
          </Button>
        ))}
      </div>
      <label htmlFor={ids.name} className="o-field-label">
        {t('cloud.remote.start.name')}
      </label>
      <input
        id={ids.name}
        className="o-input"
        autoComplete="off"
        value={state.name}
        onChange={(event) => {
          view.onName(event.target.value);
        }}
      />
      <label htmlFor={ids.message} className="o-field-label">
        {t('cloud.remote.start.message')}
      </label>
      <textarea
        id={ids.message}
        className="o-input"
        rows={3}
        placeholder={t('cloud.remote.start.messageHint')}
        value={state.message}
        onChange={(event) => {
          view.onMessage(event.target.value);
        }}
      />
      <span className="o-field-label">{t('cloud.remote.start.overrides')}</span>
      <div className="o-inline">
        <label htmlFor={ids.model} className="o-field-label">
          {t('cloud.remote.start.model')}
        </label>
        <input
          id={ids.model}
          className="o-input o-mono"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('cloud.remote.start.agentDefault')}
          value={state.model}
          onChange={(event) => {
            view.onModel(event.target.value);
          }}
        />
        <label htmlFor={ids.effort} className="o-field-label">
          {t('cloud.remote.start.effort')}
        </label>
        <input
          id={ids.effort}
          className="o-input o-mono"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('cloud.remote.start.agentDefault')}
          value={state.effort}
          onChange={(event) => {
            view.onEffort(event.target.value);
          }}
        />
      </div>
      <div className="o-inline" role="group" aria-label={t('cloud.remote.start.permissions')}>
        <span className="o-field-label">{t('cloud.remote.start.permissions')}</span>
        {PERMISSION_MODES.map((mode) => (
          <Button
            key={mode}
            variant="ghost"
            aria-pressed={state.permissionMode === mode}
            onClick={() => {
              view.onPermissionMode(mode);
            }}
          >
            {t(`cloud.remote.start.permissionModes.${mode}`)}
          </Button>
        ))}
      </div>
      {state.permissionMode === 'bypass' ? (
        <Banner tone="warning" tag={t('cloud.remote.start.permissionModes.bypass')}>
          {t('cloud.remote.start.bypassWarning', { device })}
        </Banner>
      ) : (
        <p className="o-row__meta">{t('cloud.remote.start.askHint')}</p>
      )}
      {state.error === undefined ? null : (
        <p className="cl-recipe__problem" role="alert">
          {deviceFailureText(t, state.error)}
        </p>
      )}
      <span className="o-inline">
        <Button type="submit" disabled={!view.canCreate}>
          {view.creating
            ? t('cloud.start.starting')
            : chosen === undefined
              ? t('cloud.remote.start.create')
              : t('cloud.remote.start.startOn', { device: chosen.name })}
        </Button>
      </span>
    </form>
  );
}
