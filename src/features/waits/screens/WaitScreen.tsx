// SPDX-License-Identifier: AGPL-3.0-only
import type { Wait } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute, formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Markdown } from '@/shared/ui/Markdown';
import { Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { WaitForm } from '../components/WaitForm';
import { actionsOf, answeredThroughSession, isViewer, shownValue, targetOf } from '../model';
import { type PeopleViewModel, type Refused, usePeople, useWait, useWaitWrites } from '../useWaits';
import '../waits.css';

export function WaitScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const { waitId } = useParams({ from: '/waits/$waitId' });
  const view = useWait(waitId);
  const people = usePeople();
  const now = useNow();
  return (
    <LoadState data={view.wait} failure={view.failure} rows={2}>
      {(wait) => (
        <Screen
          top={
            <Link to="/waits" className="o-back">
              {t('waits.detail.back')}
            </Link>
          }
          title={wait.question.title}
          lead={t('waits.detail.lead', {
            who: wait.createdBy === undefined ? t('waits.detail.unknown') : people.nameOf(wait.createdBy),
            when: formatRelative(wait.createdAt, now, i18n.language),
          })}
        >
          <WaitDetail wait={wait} people={people} />
        </Screen>
      )}
    </LoadState>
  );
}

function WaitDetail({
  wait,
  people,
}: {
  readonly wait: Wait;
  readonly people: PeopleViewModel;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const writes = useWaitWrites(wait.id);
  const open = wait.status === 'open';
  const mayAnswer = isViewer(wait.assignee, people.me) || people.me.canManage;
  const refs = wait.question.refs ?? [];
  return (
    <>
      {writes.refused === undefined ? null : <Refusal refused={writes.refused} />}
      <Section label={t('waits.detail.about')}>
        <Facts
          facts={[
            { label: t('waits.detail.status'), value: <StatusBadge wait={wait} people={people} /> },
            { label: t('waits.detail.assignee'), value: people.nameOf(wait.assignee) },
            wait.createdBy === undefined
              ? undefined
              : { label: t('waits.detail.askedBy'), value: people.nameOf(wait.createdBy) },
            wait.sessionId === undefined
              ? undefined
              : {
                  label: t('waits.detail.session'),
                  value: (
                    <Link to="/sessions/$sessionId" params={{ sessionId: wait.sessionId }}>
                      {wait.sessionId}
                    </Link>
                  ),
                  mono: true,
                },
            { label: t('waits.detail.askedAt'), value: formatAbsolute(wait.createdAt, i18n.language) },
            wait.resolvedAt === undefined
              ? undefined
              : { label: t('waits.detail.closedAt'), value: formatAbsolute(wait.resolvedAt, i18n.language) },
          ]}
        />
      </Section>
      {wait.question.body === undefined || wait.question.body === '' ? null : (
        <Section label={t('waits.detail.body')}>
          <Markdown source={wait.question.body} />
        </Section>
      )}
      {refs.length === 0 ? null : (
        <Section label={t('waits.detail.refs')}>
          <ul className="wt-refs">
            {refs.map((ref, at) => {
              const target = targetOf(ref);
              const text = ref.title ?? ref.id ?? ref.url ?? ref.kind;
              return (
                <li key={`${String(at)}-${text}`}>
                  {target === undefined ? (
                    text
                  ) : target.kind === 'session' ? (
                    <Link to="/sessions/$sessionId" params={{ sessionId: target.id }}>
                      {text}
                    </Link>
                  ) : target.kind === 'artifact' ? (
                    <Link to="/artifacts" hash={target.id}>
                      {text}
                    </Link>
                  ) : (
                    <a href={target.href} target="_blank" rel="noopener noreferrer nofollow">
                      {text}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {open ? (
        <Section label={t('waits.detail.answer')}>
          {answeredThroughSession(wait) ? (
            <Banner tag={t('waits.detail.throughSessionTag')}>
              {t('waits.detail.throughSession')}{' '}
              {wait.sessionId === undefined ? null : (
                <Link to="/sessions/$sessionId" params={{ sessionId: wait.sessionId }}>
                  {t('waits.detail.openSession')}
                </Link>
              )}
            </Banner>
          ) : mayAnswer ? (
            <WaitForm wait={wait} sending={writes.sending} onAnswer={writes.answer} />
          ) : (
            <Banner tag={t('waits.detail.notYoursTag')}>
              {t('waits.detail.notYours', { who: people.nameOf(wait.assignee) })}
            </Banner>
          )}
          <ConfirmButton
            label={t('waits.detail.cancel')}
            confirm={t('waits.detail.cancelConfirm')}
            keep={t('waits.detail.keep')}
            disabled={writes.sending}
            onConfirm={writes.cancel}
          />
        </Section>
      ) : (
        <Outcome wait={wait} people={people} />
      )}
    </>
  );
}

function Refusal({ refused }: { readonly refused: Refused }): ReactElement {
  const { t } = useTranslation();
  return (
    <Banner
      tone={refused.kind === 'closed' ? 'warning' : 'danger'}
      tag={t(`waits.refused.${refused.kind}`)}
      live
    >
      {refused.kind === 'closed' ? t('waits.refused.closedBody') : refused.message}
    </Banner>
  );
}

function Outcome({ wait, people }: { readonly wait: Wait; readonly people: PeopleViewModel }): ReactElement {
  const { t, i18n } = useTranslation();
  const { answer } = wait;
  if (answer === undefined) {
    return (
      <Section label={t('waits.detail.answer')}>
        <p>{wait.status === 'cancelled' ? t('waits.detail.cancelled') : t('waits.detail.noAnswer')}</p>
      </Section>
    );
  }
  const { fields = [] } = wait.question;
  const actions = actionsOf(wait, t('waits.detail.done'));
  const values = Object.entries(answer.values ?? {});
  return (
    <Section label={t('waits.detail.answer')}>
      <p>
        {t('waits.detail.answeredWith', {
          action: actions.find((action) => action.id === answer.action)?.label ?? answer.action,
          who: people.nameOf(answer.author),
          when: formatAbsolute(answer.answeredAt, i18n.language),
        })}
      </p>
      {values.length === 0 ? null : (
        <dl className="wt-answer">
          {values.map(([id, value]) => (
            <div key={id}>
              <dt className="o-field-label">{fields.find((field) => field.id === id)?.label ?? id}</dt>
              <dd>{shownValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}
