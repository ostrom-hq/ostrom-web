// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Markdown } from '@/shared/ui/Markdown';
import type { TranscriptEvent } from '../events';
import { keyOf, nestedOf, type SystemEvent, type ToolItem, type TranscriptItem } from '../items';
import type { Subagent } from '../subagents';
import { MessageFiles } from './FileComponents';
import { SubagentStateBadge } from './RunningPanel';

/** With feeds, a subagent's card opens its own thread; `subagents` gives each its type, description and state. */
export interface ThreadLinks {
  readonly subagents: ReadonlyMap<string, Subagent>;
  readonly open: (id: string) => void;
}

/** One item of the transcript (TeamCode's companion `TranscriptItemView`). */
export function TranscriptItemView({
  item,
  memberId,
  threads,
}: {
  readonly item: TranscriptItem;
  /** The viewer's member id: a message by someone else says so. */
  readonly memberId: string | undefined;
  readonly threads?: ThreadLinks | undefined;
}): ReactElement {
  return (
    <div className={nestedOf(item) ? 'cc-item cc-item--nested' : 'cc-item'}>
      <ItemBody item={item} memberId={memberId} threads={threads} />
    </div>
  );
}

function ItemBody({
  item,
  memberId,
  threads,
}: {
  readonly item: TranscriptItem;
  readonly memberId: string | undefined;
  readonly threads: ThreadLinks | undefined;
}): ReactElement {
  const { t } = useTranslation();
  switch (item.kind) {
    case 'user':
      return (
        <div className="cc-user">
          {item.event.authorId !== undefined && item.event.authorId !== memberId ? (
            <span className="cc-meta">{t('cloudConversation.from')}</span>
          ) : null}
          {item.event.text === '' ? null : <p className="cc-bubble">{item.event.text}</p>}
          <MessageFiles files={item.event.files} />
        </div>
      );
    case 'agent':
      return <Markdown source={item.event.text} />;
    case 'tool':
      return <ToolCard tool={item} />;
    case 'tools':
      return <ToolGroup tools={item.tools} />;
    case 'subagent': {
      // With feeds the card opens the subagent's own thread; without, its steps show nested under it.
      const subagent = threads?.subagents.get(item.call.id);
      if (threads !== undefined && subagent !== undefined)
        return <SubagentCard subagent={subagent} onOpen={threads.open} />;
      return (
        <div className="cc-tool">
          <span className="cc-tool__name">{item.call.name}</span>
          <span className="cc-meta">{item.call.summary ?? ''}</span>
        </div>
      );
    }
    case 'turnEnd':
      return <TurnSeparator event={item.event} />;
    case 'system':
      return <SystemLine event={item.event} />;
  }
}

function SubagentCard({
  subagent,
  onOpen,
}: {
  readonly subagent: Subagent;
  readonly onOpen: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="cc-tool cc-tool__head"
      aria-label={t('cloudConversation.work.open', { type: subagent.type })}
      onClick={() => {
        onOpen(subagent.id);
      }}
    >
      <span className="cc-tool__name">{subagent.type}</span>
      <span className="cc-meta">{subagent.description}</span>
      <SubagentStateBadge subagent={subagent} />
    </button>
  );
}

function ToolCard({ tool }: { readonly tool: ToolItem }): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { call, result } = tool;
  const failed = result !== undefined && (result.isError || (result.exitCode ?? 0) !== 0);
  return (
    <div className={failed ? 'cc-tool cc-tool--failed' : 'cc-tool'}>
      <button
        type="button"
        className="cc-tool__head"
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <span className="cc-tool__name">{call?.name ?? t('cloudConversation.output')}</span>
        <span className="cc-meta o-mono">{call?.summary ?? ''}</span>
      </button>
      {open ? (
        <div className="o-stack">
          {call === undefined ? null : (
            <>
              <span className="o-label">{t('cloudConversation.input')}</span>
              <pre className="cc-code o-mono">{call.input}</pre>
            </>
          )}
          {result === undefined ? null : (
            <>
              <span className="o-label">
                {result.isError ? t('cloudConversation.error') : t('cloudConversation.output')}
              </span>
              <pre className="cc-code o-mono">{result.output}</pre>
              {result.exitCode === undefined || result.exitCode === 0 ? null : (
                <span className="cc-danger">
                  {t('cloudConversation.exitCode', { code: result.exitCode })}
                </span>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A run of tool uses without text between them: "4 actions · Read · Bash · Grep", unfolded on a press. */
function ToolGroup({ tools }: { readonly tools: readonly ToolItem[] }): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const names = [...new Set(tools.flatMap((tool) => (tool.call === undefined ? [] : [tool.call.name])))];
  const summary = names.slice(0, 3).join(' · ') + (names.length > 3 ? ' · …' : '');
  return (
    <div className="o-stack">
      <button
        type="button"
        className="cc-tool cc-tool__head"
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <span className="cc-meta">{t('cloudConversation.actions', { count: tools.length })}</span>
        <span className="cc-meta">{summary}</span>
      </button>
      {open ? tools.map((tool) => <ToolCard key={keyOf(tool)} tool={tool} />) : null}
    </div>
  );
}

function TurnSeparator({
  event,
}: {
  readonly event: Extract<TranscriptEvent, { kind: 'turn' }>;
}): ReactElement {
  const { t, i18n } = useTranslation();
  // Only a finished turn has a separator.
  const label =
    event.phase === 'interrupted' || event.phase === 'failed'
      ? t(`cloudConversation.turn.${event.phase}`)
      : t('cloudConversation.turn.completed');
  const details = [
    label,
    event.durationMs === undefined
      ? undefined
      : t('cloudConversation.seconds', { count: Math.floor(event.durationMs / 1000) }),
    event.steps === undefined ? undefined : t('cloudConversation.steps', { count: event.steps }),
    formatAbsolute(event.at, i18n.language),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
  return (
    <p className={event.phase === 'failed' ? 'cc-separator cc-danger' : 'cc-separator'} role="separator">
      {details}
    </p>
  );
}

function systemText(event: SystemEvent, t: ReturnType<typeof useTranslation>['t']): string {
  switch (event.kind) {
    case 'status':
      return event.exitCode === undefined
        ? t('cloudConversation.system.agentStarted')
        : t('cloudConversation.system.agentExited', { code: event.exitCode });
    case 'error':
      return t('cloudConversation.system.error', { message: event.message ?? event.code ?? '' });
    case 'input':
      if (event.status === 'consumed') return t('cloudConversation.system.permissionAnswered');
      return event.status === 'cancelled'
        ? t('cloudConversation.system.inputCancelled', { reason: event.reason ?? event.status })
        : t('cloudConversation.system.inputRejected', { reason: event.reason ?? event.status });
    case 'permission':
      return event.question
        ? t('cloudConversation.system.question')
        : t('cloudConversation.system.permission', {
            tool: event.toolName ?? t('cloudConversation.system.aTool'),
          });
    case 'permissionExpired':
      return t('cloudConversation.system.permissionExpired');
    case 'transferred':
      return t('cloudConversation.system.transferred');
    case 'truncated':
      return t('cloudConversation.system.truncated', { type: event.type });
  }
}

function SystemLine({ event }: { readonly event: SystemEvent }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <p className={event.kind === 'error' ? 'cc-system cc-danger' : 'cc-system'}>
      {systemText(event, t)}
      <span className="cc-meta">{formatAbsolute(event.at, i18n.language)}</span>
    </p>
  );
}
