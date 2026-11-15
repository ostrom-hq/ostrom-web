// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { durationOf } from '../controls';
import { hasContent, runningCount, type Subagent } from '../subagents';
import type { RunningWorkViewModel } from '../useRunningWork';

/** 42 s, 3 min 5 s, 1 h 12 min. */
function DurationText({ millis }: { readonly millis: number }): ReactElement {
  const { t } = useTranslation();
  const duration = durationOf(millis);
  const text =
    duration.unit === 'seconds'
      ? t('cloudConversation.work.seconds', { seconds: duration.seconds })
      : duration.unit === 'minutes'
        ? t('cloudConversation.work.minutes', { minutes: duration.minutes, seconds: duration.seconds })
        : t('cloudConversation.work.hours', { hours: duration.hours, minutes: duration.minutes });
  return <span className="cc-meta">{text}</span>;
}

const STATE_TONES: Readonly<Record<Subagent['state'], BadgeTone>> = {
  running: 'success',
  done: 'neutral',
  failed: 'danger',
  stopped: 'warning',
  background: 'neutral',
};

/** Running, Waiting (parked on a wait), Done, Failed, Stopped, In background. */
export function SubagentStateBadge({ subagent }: { readonly subagent: Subagent }): ReactElement {
  const { t } = useTranslation();
  const waiting = subagent.state === 'running' && subagent.waiting;
  return (
    <Badge tone={waiting ? 'warning' : STATE_TONES[subagent.state]}>
      {waiting
        ? t('cloudConversation.work.state.waiting')
        : t(`cloudConversation.work.state.${subagent.state}`)}
    </Badge>
  );
}

/** Stop, confirmed by a second press that names the task; "Stopping…" until the runner's next report drops it. */
function StopControl({
  taskId,
  name,
  view,
}: {
  readonly taskId: string;
  readonly name: string;
  readonly view: RunningWorkViewModel;
}): ReactElement {
  const { t } = useTranslation();
  if (view.stopping.has(taskId))
    return (
      <span className="cc-meta" role="status">
        {t('cloudConversation.work.stopping')}
      </span>
    );
  return (
    <ConfirmButton
      label={t('cloudConversation.work.stop')}
      confirm={t('cloudConversation.work.confirmStop', { name })}
      keep={t('cloudConversation.work.keep')}
      disabled={false}
      onConfirm={() => {
        view.stop(taskId);
      }}
    />
  );
}

function Row({
  title,
  subtitle,
  trailing,
  footer,
  depth = 0,
  mono = false,
}: {
  readonly title: ReactNode;
  readonly subtitle: string | undefined;
  readonly trailing?: ReactNode;
  readonly footer?: ReactNode;
  readonly depth?: number;
  readonly mono?: boolean;
}): ReactElement {
  return (
    <li className="cc-work__row" style={{ marginInlineStart: `${String(Math.min(depth, 4) * 14)}px` }}>
      <span className="cc-work__line">
        <span className={mono ? 'cc-work__title o-mono' : 'cc-work__title'}>{title}</span>
        {trailing}
      </span>
      {subtitle === undefined || subtitle.trim() === '' ? null : <span className="cc-meta">{subtitle}</span>}
      {footer}
    </li>
  );
}

/**
 * What runs in the session besides the conversation (TeamCode's companion `SubagentPanel`): the main conversation, then
 * each section that has something (subagents, background commands, monitors and waits, scheduled wake-ups), and why a
 * task cannot be stopped from here when it cannot.
 */
export function RunningPanel({
  view,
  thread,
  onOpen,
  onMain,
}: {
  readonly view: RunningWorkViewModel;
  readonly thread: string | undefined;
  readonly onOpen: (id: string) => void;
  readonly onMain: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const { work, now, canStop } = view;
  if (!hasContent(work)) return null;
  const running = runningCount(work);
  const monitors = work.commands.filter((command) => command.monitor);
  const commands = work.commands.filter((command) => !command.monitor);
  const scheduled = work.live?.scheduled ?? 0;
  const note =
    work.live === undefined
      ? t('cloudConversation.work.noReports')
      : (work.commands.length > 0 || work.subagents.some((agent) => agent.taskId !== undefined)) && !canStop
        ? t('cloudConversation.work.readOnly')
        : undefined;
  return (
    <aside className="cc-work" aria-label={t('cloudConversation.work.title')}>
      <h2 className="o-label">
        {t('cloudConversation.work.title')}{' '}
        {running > 0 ? (
          <Badge tone="success">{t('cloudConversation.work.running', { count: running })}</Badge>
        ) : null}
      </h2>
      {view.threads ? (
        <ul className="cc-work__list">
          <Row
            title={
              <Button variant="ghost" aria-pressed={thread === undefined} onClick={onMain}>
                {t('cloudConversation.work.main')}
              </Button>
            }
            subtitle={t('cloudConversation.work.mainHint')}
          />
        </ul>
      ) : null}
      {work.subagents.length === 0 ? null : (
        <>
          <h3 className="o-label">{`${t('cloudConversation.work.subagents')} · ${String(work.subagents.length)}`}</h3>
          <ul className="cc-work__list">
            {work.subagents.map((subagent) => (
              <Row
                key={subagent.id}
                depth={subagent.depth}
                title={
                  view.threads ? (
                    <Button
                      variant="ghost"
                      aria-pressed={thread === subagent.id}
                      onClick={() => {
                        onOpen(subagent.id);
                      }}
                    >
                      {subagent.type}
                    </Button>
                  ) : (
                    subagent.type
                  )
                }
                subtitle={subagent.description}
                trailing={
                  <span className="o-inline">
                    <SubagentStateBadge subagent={subagent} />
                    <DurationText millis={subagent.durationMs} />
                  </span>
                }
                footer={
                  subagent.taskId !== undefined && canStop && subagent.state === 'running' ? (
                    <StopControl taskId={subagent.taskId} name={subagent.description} view={view} />
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      {[
        { title: t('cloudConversation.work.commands'), list: commands },
        { title: t('cloudConversation.work.monitors'), list: monitors },
      ].map(({ title, list }) =>
        list.length === 0 ? null : (
          <div key={title}>
            <h3 className="o-label">{`${title} · ${String(list.length)}`}</h3>
            <ul className="cc-work__list">
              {list.map(({ task, command }) => (
                <Row
                  key={task.id}
                  mono={command !== undefined}
                  title={command ?? task.description}
                  subtitle={
                    command !== undefined && task.description !== command ? task.description : undefined
                  }
                  trailing={
                    task.startedAt === undefined ? undefined : <DurationText millis={now - task.startedAt} />
                  }
                  footer={
                    canStop ? (
                      <StopControl taskId={task.id} name={command ?? task.description} view={view} />
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </div>
        ),
      )}
      {scheduled > 0 ? (
        <>
          <h3 className="o-label">{`${t('cloudConversation.work.scheduled')} · ${String(scheduled)}`}</h3>
          <p className="cc-meta">{t('cloudConversation.work.scheduledCount', { count: scheduled })}</p>
        </>
      ) : null}
      {note === undefined ? null : <p className="cc-meta">{note}</p>}
      {view.notice === undefined ? null : (
        <p className="cc-danger" role="alert">
          {view.notice.kind === 'nothingRunning'
            ? t('cloudConversation.nothingRunning')
            : view.notice.error.message}
        </p>
      )}
    </aside>
  );
}

/** The bar over a subagent's thread: back to the main conversation, its type, description and state. */
export function ThreadBar({
  subagent,
  onBack,
}: {
  readonly subagent: Subagent;
  readonly onBack: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="cc-thread-bar">
      <Button variant="ghost" onClick={onBack}>
        {`← ${t('cloudConversation.work.main')}`}
      </Button>
      <span className="cc-tool__name">{t('cloudConversation.work.threadOf', { type: subagent.type })}</span>
      <span className="cc-meta">{subagent.description}</span>
      <SubagentStateBadge subagent={subagent} />
    </div>
  );
}
