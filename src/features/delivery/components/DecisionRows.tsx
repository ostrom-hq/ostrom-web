// SPDX-License-Identifier: Apache-2.0
import type { OrgMember } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrgMembers } from '@/shared/org/members';
import { Button } from '@/shared/ui/Button';
import { MorePeople } from '@/shared/ui/MorePeople';
import { type Decision, type DecisionChoice, candidatesOf, choiceOf, memberLabel } from '../model';

export interface DecisionRowsProps {
  /** Which delivered view each member's link opens. */
  readonly delivered: 'skills' | 'hooks';
  /** The audience: what a member with no explicit decision gets. */
  readonly allMembers: boolean;
  /** The organization's members; absent if unreadable. */
  readonly members: readonly OrgMember[] | undefined;
  /** The next page of members, read when asked. */
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore' | 'moreFailed'>;
  readonly decisions: ReadonlyMap<string, Decision>;
  readonly busy: boolean;
  readonly onDecide: (memberId: string, choice: DecisionChoice) => void;
}

/** One row per member: Default or Not assigned, Yes, or No. An explicit Yes or No always takes precedence. */
export function DecisionRows({
  delivered,
  allMembers,
  members,
  people,
  decisions,
  busy,
  onDecide,
}: DecisionRowsProps): ReactElement {
  const { t } = useTranslation();
  if (members === undefined) return <p className="o-screen__lead">{t('delivery.decisions.unreadable')}</p>;
  return (
    <>
      <ul className="o-rows" aria-label={t('delivery.decisions.list')}>
        {candidatesOf(members).map((member) => {
          const current = decisions.get(member.id) ?? 'none';
          return (
            <DecisionRow
              // Remounted when the server's decision changes: the select starts again from it.
              key={`${member.id}:${current}`}
              delivered={delivered}
              member={member}
              current={current}
              allMembers={allMembers}
              busy={busy}
              onDecide={onDecide}
            />
          );
        })}
      </ul>
      <MorePeople people={people} />
    </>
  );
}

interface DecisionRowProps {
  readonly delivered: 'skills' | 'hooks';
  readonly member: OrgMember;
  readonly current: DecisionChoice;
  readonly allMembers: boolean;
  readonly busy: boolean;
  readonly onDecide: (memberId: string, choice: DecisionChoice) => void;
}

function DecisionRow({
  delivered,
  member,
  current,
  allMembers,
  busy,
  onDecide,
}: DecisionRowProps): ReactElement {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<DecisionChoice>(current);
  const id = useId();
  const who = memberLabel(member);
  return (
    <li className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{who}</span>
        <span className="o-row__meta">
          {delivered === 'skills' ? (
            <Link to="/members/$memberId/skills" params={{ memberId: member.id }}>
              {t('delivery.decisions.deliveredSkills')}
            </Link>
          ) : (
            <Link to="/members/$memberId/hooks" params={{ memberId: member.id }}>
              {t('delivery.decisions.deliveredHooks')}
            </Link>
          )}
        </span>
      </span>
      <form
        className="o-row__end o-inline"
        aria-label={t('delivery.decisions.form', { who })}
        onSubmit={(event) => {
          event.preventDefault();
          onDecide(member.id, choice);
        }}
      >
        <label htmlFor={id} className="o-visually-hidden">
          {t('delivery.decisions.label', { who })}
        </label>
        <select
          id={id}
          className="o-input o-select"
          value={choice}
          onChange={(event) => {
            setChoice(choiceOf(event.target.value));
          }}
        >
          <option value="none">
            {allMembers ? t('delivery.decisions.default') : t('delivery.decisions.notAssigned')}
          </option>
          <option value="allow">{t('delivery.decisions.yes')}</option>
          <option value="deny">{t('delivery.decisions.no')}</option>
        </select>
        <Button type="submit" disabled={busy || choice === current}>
          {t('delivery.decisions.save')}
        </Button>
      </form>
    </li>
  );
}
