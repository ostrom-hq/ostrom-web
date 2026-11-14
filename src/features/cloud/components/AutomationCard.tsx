// SPDX-License-Identifier: Apache-2.0
import type { Automation, AutomationWrite } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { CopyField } from '@/shared/ui/CopyField';
import {
  isCancellable,
  isCloudAgent,
  isKnownRunReason,
  isKnownRunStatus,
  isWebhook,
  RUN_TONES,
  type UrlVersion,
  versionedUrl,
} from '../model';
import { useAutomationRuns } from '../useCloud';
import { AutomationForm } from './AutomationForm';
import { SecretOnce } from './SecretOnce';

export interface AutomationCardProps {
  readonly automation: Automation;
  readonly now: Date;
  readonly busy: boolean;
  /** A webhook secret just made (`created`) or rotated, shown here once. */
  readonly secret: { readonly value: string; readonly created: boolean } | undefined;
  /** Present when the viewer may change this automation. */
  readonly actions:
    | {
        readonly toggle: () => void;
        readonly run: (dry: boolean) => void;
        readonly rotate: () => void;
      }
    | undefined;
  /** Present when the viewer owns it: only its owner changes what it does. */
  readonly edit:
    | {
        readonly saving: boolean;
        /** Why the server refused the last change, as it wrote it: said above the editor. */
        readonly failure: Error | undefined;
        /** `onSaved` runs once the server took the change: the editor closes then, not before. */
        readonly save: (write: AutomationWrite, onSaved: () => void) => void;
        /** Runs as the editor opens: the last answer of another gesture is forgotten. */
        readonly onOpen: () => void;
      }
    | undefined;
}

function Runs({
  id,
  now,
  canCancel,
}: {
  readonly id: string;
  readonly now: Date;
  /** The viewer may change this automation, so may end its runs. */
  readonly canCancel: boolean;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const { runs, failure, cancel, cancelling, cancelFailure } = useAutomationRuns(id);
  if (failure !== undefined) return <p className="o-row__meta">{failure.message}</p>;
  if (runs === undefined) return <p className="o-row__meta">{t('automations.runs.loading')}</p>;
  if (runs.length === 0) return <p className="o-row__meta">{t('automations.runs.empty')}</p>;
  return (
    <>
      {cancelFailure === undefined ? null : (
        <Banner tone="danger" tag={t('automations.runs.cancelFailedTag')} live>
          {cancelFailure.message}
        </Banner>
      )}
      <ul className="o-rows">
        {runs.map((run) => (
          <li key={run.id} className="o-row">
            <span className="o-row__main">
              <span className="o-row__title">
                {t('automations.runs.line', {
                  when: formatRelative(run.createdAt, now, i18n.language),
                  source: run.source,
                })}
              </span>
              {run.reason === undefined || run.reason === null ? null : (
                <span className="o-row__meta">
                  {isKnownRunReason(run.reason) ? t(`automations.runReason.${run.reason}`) : run.reason}
                </span>
              )}
            </span>
            {run.workflowRunId === undefined || run.workflowRunId === null ? null : (
              <Link to="/runs/$runId" params={{ runId: run.workflowRunId }} className="o-row__meta">
                {t('automations.runs.workflowRun')}
              </Link>
            )}
            {isKnownRunStatus(run.status) ? (
              <Badge tone={RUN_TONES[run.status]}>{t(`automations.runStatus.${run.status}`)}</Badge>
            ) : (
              <Badge tone="neutral">{run.status}</Badge>
            )}
            {canCancel && isCancellable(run.status) ? (
              <ConfirmButton
                label={
                  cancelling === run.id ? t('automations.runs.cancelling') : t('automations.runs.cancel')
                }
                confirm={t('automations.runs.cancelConfirm')}
                keep={t('automations.runs.keep')}
                disabled={cancelling !== undefined}
                onConfirm={() => {
                  cancel(run.id);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The address a sender that pins a version calls: the newest version of the automation (`latest`), or the one now
 * saved. The server serves both with the automations (ostrom-server#406).
 */
function VersionedUrl({
  url,
  version,
}: {
  readonly url: string;
  readonly version: number;
}): ReactElement | null {
  const { t } = useTranslation();
  const [which, setWhich] = useState<UrlVersion>('latest');
  const id = useId();
  const pinned = versionedUrl(url, which, version);
  if (pinned === undefined) return null;
  return (
    <div className="o-stack">
      <label htmlFor={id} className="o-field-label">
        {t('automations.versionedUrl.label')}
      </label>
      <select
        id={id}
        className="o-input o-select"
        value={which}
        onChange={(event) => {
          setWhich(event.target.value === 'current' ? 'current' : 'latest');
        }}
      >
        <option value="latest">{t('automations.versionedUrl.latest')}</option>
        <option value="current">{t('automations.versionedUrl.current', { version })}</option>
      </select>
      <CopyField label={t('automations.versionedUrl.copyLabel')} value={pinned} />
      <p className="o-row__meta">{t('automations.versionedUrl.lead')}</p>
    </div>
  );
}

/** What starts it, what it does, its limits, then its runs on demand. */
export function AutomationCard({
  automation,
  now,
  busy,
  secret,
  actions,
  edit,
}: AutomationCardProps): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The automation as it stood when its editor opened: a save sends the version read then, never a newer one.
  const [editing, setEditing] = useState<Automation | undefined>(undefined);
  const headingId = useId();
  const runsId = useId();
  const { trigger, action } = automation;
  const agent =
    action.agent === undefined
      ? undefined
      : isCloudAgent(action.agent)
        ? t(`cloud.agent.${action.agent}`)
        : action.agent;
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline">
        <h3 id={headingId} className="cl-name">
          {automation.name}
        </h3>
        <Badge tone={automation.enabled ? 'success' : 'neutral'}>
          {automation.enabled ? t('automations.on') : t('automations.off')}
        </Badge>
      </div>
      {editing !== undefined && edit !== undefined ? (
        <>
          {edit.failure === undefined ? null : (
            <Banner tone="danger" tag={t('automations.errorTag')} live>
              {edit.failure.message}
            </Banner>
          )}
          <AutomationForm
            automation={editing}
            saving={edit.saving}
            submit={t('automations.form.save')}
            onCancel={() => {
              setEditing(undefined);
            }}
            onSave={(write) => {
              edit.save(write, () => {
                setEditing(undefined);
              });
            }}
          />
        </>
      ) : null}
      <p className="o-row__meta">
        {isWebhook(automation)
          ? t('automations.trigger.webhook')
          : t('automations.trigger.cron', {
              schedule: [trigger.cron, trigger.timezone].filter((part) => part !== undefined).join(' · '),
            })}
      </p>
      <p className="cl-action">
        {action.workflowId !== undefined
          ? t('automations.action.workflow', { workflow: action.workflowId })
          : t('automations.action.prompt', {
              agent: agent ?? t('automations.action.defaultAgent'),
              prompt: action.prompt ?? '',
            })}
      </p>
      <p className="o-row__meta">
        {[
          t('automations.owner', { owner: automation.owner }),
          t('automations.version', { version: automation.version }),
          automation.maxRunsPerDay === undefined
            ? undefined
            : t('automations.perDay', { count: automation.maxRunsPerDay }),
          action.maxRuntimeMinutes === undefined
            ? undefined
            : t('automations.runtime', { minutes: action.maxRuntimeMinutes }),
          automation.overlap === 'skip' ? t('automations.overlapSkip') : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(' · ')}
      </p>
      {automation.webhookUrl === undefined ? null : (
        <p className="o-row__meta o-mono cl-url">{automation.webhookUrl}</p>
      )}
      {automation.webhookUrl === undefined ? null : (
        <VersionedUrl url={automation.webhookUrl} version={automation.version} />
      )}
      {secret === undefined ? null : (
        <SecretOnce name={automation.name} value={secret.value} created={secret.created} />
      )}
      <div className="o-inline">
        <Button
          aria-expanded={open}
          aria-controls={runsId}
          variant="ghost"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? t('automations.runs.hide') : t('automations.runs.show')}
        </Button>
        {edit === undefined || editing !== undefined ? null : (
          <Button
            onClick={() => {
              edit.onOpen();
              setEditing(automation);
            }}
          >
            {t('automations.form.edit')}
          </Button>
        )}
        {actions === undefined ? null : (
          <>
            <Button disabled={busy} onClick={actions.toggle}>
              {automation.enabled ? t('automations.turnOff') : t('automations.turnOn')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                actions.run(false);
              }}
            >
              {t('automations.runNow')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                actions.run(true);
              }}
            >
              {t('automations.dryRun')}
            </Button>
            {isWebhook(automation) ? (
              <Button variant="ghost" disabled={busy} onClick={actions.rotate}>
                {t('automations.rotate')}
              </Button>
            ) : null}
          </>
        )}
      </div>
      <div id={runsId} hidden={!open}>
        {open ? <Runs id={automation.id} now={now} canCancel={actions !== undefined} /> : null}
      </div>
    </article>
  );
}
