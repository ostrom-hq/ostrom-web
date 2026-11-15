// SPDX-License-Identifier: Apache-2.0
import type { SessionDto, SessionGateAnswerDto } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import type { TFunction } from '@/shared/i18n/instance';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute, formatDuration } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { useNow } from '@/shared/lib/useNow';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { type Fact, Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { ActivityBadge } from '../components/ActivityBadge';
import { LaunchLimitsSection } from '../components/LaunchLimitsSection';
import { StateBadge } from '../components/StateBadge';
import { TodoPill } from '../components/TodoPill';
import { TodoView } from '../components/TodoView';
import { sessionLabels, sessionState } from '../model';
import { useSessionTodo } from '../useSessionTodo';
import { type SessionReceipt, useSession } from '../useSessions';

export function SessionScreen(): ReactElement {
  const { t } = useTranslation();
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const { session, receipt, failure } = useSession(sessionId);
  const now = useNow();
  const { role } = useCurrentOrg();
  const { todo } = useSessionTodo(sessionId, session !== undefined && typeof session.endedAt !== 'string');
  const [open, setOpen] = useState(false);
  const todoId = useId();
  return (
    <LoadState data={session} failure={failure} rows={2}>
      {(found) => (
        <Screen
          top={
            <>
              <Link to="/sessions" className="o-back">
                {t('sessions.detail.back')}
              </Link>
              <StateBadge state={sessionState(found, now)} />
              <ActivityBadge session={found} now={now} />
              {todo === undefined ? null : (
                <TodoPill
                  todo={todo}
                  open={open}
                  controls={todoId}
                  onToggle={() => {
                    setOpen((was) => !was);
                  }}
                />
              )}
            </>
          }
          title={[found.agent, found.repo].filter((part) => typeof part === 'string').join(' · ')}
          lead={t('sessions.detail.by', { dev: found.dev })}
        >
          {todo !== undefined && open ? <TodoView id={todoId} todo={todo} /> : null}
          <SessionDetail session={found} receipt={receipt} />
          <LaunchLimitsSection key={found.launchId} launchId={found.launchId ?? undefined} role={role} />
        </Screen>
      )}
    </LoadState>
  );
}

interface SessionDetailProps {
  readonly session: SessionDto;
  readonly receipt: SessionReceipt | undefined;
}

function optional(label: string, value: string | number | null | undefined, mono = false): Fact | undefined {
  return value === undefined || value === null ? undefined : { label, value, mono };
}

function SessionDetail({ session, receipt }: SessionDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const at = (iso: string | null | undefined): string | undefined =>
    typeof iso === 'string' ? formatAbsolute(iso, i18n.language) : undefined;
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' });
  // A single read without `gates` is a session the caller reads the record of only (an owner or an administrator
  // reading another member's, TeamCode #238): what it did is its person's and its approvers'.
  const recordOnly = !Array.isArray(session.gates);
  const gates = session.gates ?? [];
  return (
    <>
      <Section label={t('sessions.detail.who')}>
        <Facts
          facts={[
            {
              label: t('sessions.detail.dev'),
              value:
                session.devVerified === true
                  ? t('sessions.detail.verified', { dev: session.dev })
                  : session.dev,
            },
            optional(t('sessions.detail.agent'), session.agent),
            optional(t('sessions.detail.model'), session.model),
            optional(t('sessions.detail.repo'), session.repo),
            optional(t('sessions.detail.cwd'), session.cwd, true),
          ]}
        />
      </Section>

      {sessionLabels(session).length === 0 ? null : (
        <Section label={t('sessions.detail.labels')}>
          <ul className="o-inline">
            {sessionLabels(session).map((label) => (
              <li key={label}>
                <Badge tone="neutral">{label}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label={t('sessions.detail.when')}>
        <Facts
          facts={[
            { label: t('sessions.detail.started'), value: formatAbsolute(session.startedAt, i18n.language) },
            optional(t('sessions.detail.lastSeen'), at(session.lastSeenAt)),
            typeof session.endedAt === 'string'
              ? {
                  label: t('sessions.detail.ended'),
                  value: t('sessions.detail.endedValue', {
                    when: formatAbsolute(session.endedAt, i18n.language),
                    duration: formatDuration(session.startedAt, session.endedAt, i18n.language),
                  }),
                }
              : undefined,
            optional(t('sessions.detail.endedBy'), session.endedBy),
            optional(t('sessions.detail.segment'), session.segment),
            typeof session.resumedFrom === 'string'
              ? {
                  label: t('sessions.detail.resumedFrom'),
                  value: (
                    <Link to="/sessions/$sessionId" params={{ sessionId: session.resumedFrom }}>
                      {session.resumedFrom}
                    </Link>
                  ),
                  mono: true,
                }
              : undefined,
          ]}
        />
      </Section>

      <Section label={t('sessions.detail.what')}>
        <Facts
          facts={[
            optional(t('sessions.detail.tools'), session.tools),
            typeof session.costUsd === 'number'
              ? { label: t('sessions.detail.cost'), value: money.format(session.costUsd) }
              : undefined,
            optional(t('sessions.detail.exitCode'), session.exitCode, true),
            optional(t('sessions.detail.harness'), session.harnessVersion, true),
            optional(t('sessions.detail.package'), session.packageDigest, true),
          ]}
        />
        {recordOnly ? (
          <p className="o-screen__lead">{t('sessions.detail.recordOnly', { dev: session.dev })}</p>
        ) : null}
        {gates.length === 0 ? null : (
          <>
            <h3 className="o-label">{t('sessions.detail.requests', { count: gates.length })}</h3>
            <ul className="o-rows">
              {gates.map((gate) => (
                <li key={gate}>
                  <GateLine
                    gate={gate}
                    answer={session.gateAnswers?.find((item) => item.gateId === gate)}
                    ended={typeof session.endedAt === 'string'}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section label={t('sessions.detail.receipt')}>
        {receipt === undefined ? (
          <p className="o-screen__lead">
            {recordOnly && typeof session.receiptId === 'string'
              ? t('sessions.detail.signedReceipt', { id: session.receiptId })
              : t('sessions.detail.noReceipt')}
          </p>
        ) : (
          <Link to="/receipts/$receiptId" params={{ receiptId: receipt.id }} className="o-btn o-self-start">
            {t('sessions.detail.openReceipt', { id: receipt.id })}
          </Link>
        )}
      </Section>
    </>
  );
}

interface GateLineProps {
  readonly gate: string;
  /** The server's answer to the gate, once someone said yes or no; nothing while it waits. */
  readonly answer: SessionGateAnswerDto | undefined;
  /** The session ended: a gate nobody answered by then is said not answered, not waiting (it may still be, at /yes). */
  readonly ended: boolean;
}

function toneOf(answer: SessionGateAnswerDto | undefined): BadgeTone {
  if (answer === undefined) return 'neutral';
  return answer.outcome === 'approved' ? 'success' : 'danger';
}

function labelOf(answer: SessionGateAnswerDto | undefined, ended: boolean, t: TFunction): string {
  if (answer === undefined) return ended ? t('sessions.detail.notAnswered') : t('sessions.detail.unanswered');
  return answer.outcome === 'approved' ? t('sessions.detail.approved') : t('sessions.detail.refused');
}

/** A request the session made, and who answered it: the thread of the session, read on its own page. */
function GateLine({ gate, answer, ended }: GateLineProps): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <span className="o-row">
      <Badge tone={toneOf(answer)}>{labelOf(answer, ended, t)}</Badge>
      <span className="o-row__main">
        <Link to="/yes/$approvalId" params={{ approvalId: gate }} className="o-row__title o-mono">
          {answer?.actionClass ?? gate}
        </Link>
        {answer === undefined ? null : (
          <span className="o-row__meta">
            {t('sessions.detail.answeredBy', {
              by: answer.by,
              when: formatAbsolute(answer.at, i18n.language),
            })}
          </span>
        )}
      </span>
      {typeof answer?.receiptId === 'string' ? (
        <Link to="/receipts/$receiptId" params={{ receiptId: answer.receiptId }} className="o-row__end">
          {t('sessions.detail.answerReceipt')}
        </Link>
      ) : null}
    </span>
  );
}
