// SPDX-License-Identifier: AGPL-3.0-only
import type { Group, OrgMember } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Section } from '@/shared/ui/Screen';
import { pauseEndIn, pauseEndOn, pausedUntil, personOf } from '../groups';
import type { GroupChangeViewModel } from '../useGroups';

export interface GroupMembersProps {
  readonly group: Group;
  /** The organization's members: who of the group left it, and who can be added. Unknown, nobody is said to have left. */
  readonly members: readonly OrgMember[] | undefined;
  /** Present for an owner or an admin. */
  readonly change: GroupChangeViewModel | undefined;
}

/** Who is in the group, who is paused until when, and, for an owner or an admin, the gestures on each. */
export function GroupMembers({ group, members, change }: GroupMembersProps): ReactElement {
  const { t } = useTranslation();
  const candidates = (members ?? []).filter((member) => !group.members.includes(member.login));
  return (
    <Section label={t('sharing.groups.members')}>
      {group.members.length === 0 ? (
        <p className="o-row__meta">{t('sharing.groups.noMember')}</p>
      ) : (
        <ul className="o-rows">
          {group.members.map((login) => (
            <MemberRow
              key={login}
              group={group}
              login={login}
              left={members !== undefined && !members.some((member) => member.login === login)}
              change={change}
            />
          ))}
        </ul>
      )}
      {change === undefined || candidates.length === 0 ? null : (
        <AddMember group={group} candidates={candidates} change={change} />
      )}
    </Section>
  );
}

interface MemberRowProps {
  readonly group: Group;
  readonly login: string;
  /** No longer in the organization: the group names them by member id. */
  readonly left: boolean;
  readonly change: GroupChangeViewModel | undefined;
}

function MemberRow({ group, login, left, change }: MemberRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [choosing, setChoosing] = useState(false);
  const until = pausedUntil(group, login);
  return (
    <li className="o-row">
      <span className="o-row__main">
        <span className={left ? 'o-row__title o-mono' : 'o-row__title'}>{login}</span>
        {left ? <span className="o-row__meta">{t('sharing.groups.left')}</span> : null}
        {until === undefined ? null : (
          <span className="o-row__meta">
            {t('sharing.groups.pausedUntil', { when: formatAbsolute(until, i18n.language) })}
          </span>
        )}
      </span>
      {change === undefined ? null : (
        <span className="o-inline">
          {left ? null : until === undefined ? (
            <Button
              disabled={change.pending}
              aria-expanded={choosing}
              aria-label={t('sharing.groups.pauseLabel', { login })}
              onClick={() => {
                setChoosing(!choosing);
              }}
            >
              {t('sharing.groups.pause')}
            </Button>
          ) : (
            <Button
              disabled={change.pending}
              aria-label={t('sharing.groups.resumeLabel', { login })}
              onClick={() => {
                // An instant already past ends the pause.
                change.pause(group.id, login, new Date().toISOString());
              }}
            >
              {t('sharing.groups.resume')}
            </Button>
          )}
          <ConfirmButton
            label={t('sharing.groups.remove')}
            confirm={t('sharing.groups.removeConfirm', { login })}
            keep={t('sharing.keep')}
            disabled={change.pending}
            onConfirm={() => {
              change.remove(group.id, login);
            }}
          />
        </span>
      )}
      {change === undefined || !choosing || until !== undefined ? null : (
        <PauseChoices
          login={login}
          busy={change.pending}
          onPause={(end) => {
            setChoosing(false);
            change.pause(group.id, login, end);
          }}
          onCancel={() => {
            setChoosing(false);
          }}
        />
      )}
    </li>
  );
}

interface PauseChoicesProps {
  readonly login: string;
  readonly busy: boolean;
  readonly onPause: (until: string) => void;
  readonly onCancel: () => void;
}

/** A day, a week, or until a day picked in the calendar. */
function PauseChoices({ login, busy, onPause, onCancel }: PauseChoicesProps): ReactElement {
  const { t } = useTranslation();
  const [day, setDay] = useState('');
  const dayId = useId();
  const end = pauseEndOn(day, new Date());
  return (
    <div className="o-inline sh-pause" role="group" aria-label={t('sharing.groups.pauseChoices', { login })}>
      <Button
        disabled={busy}
        onClick={() => {
          onPause(pauseEndIn('day', new Date()));
        }}
      >
        {t('sharing.groups.pauseDay')}
      </Button>
      <Button
        disabled={busy}
        onClick={() => {
          onPause(pauseEndIn('week', new Date()));
        }}
      >
        {t('sharing.groups.pauseWeek')}
      </Button>
      <label htmlFor={dayId} className="o-field-label">
        {t('sharing.groups.pauseUntil')}
      </label>
      <input
        id={dayId}
        type="date"
        className="o-input sh-day"
        value={day}
        onChange={(event) => {
          setDay(event.target.value);
        }}
      />
      {end === undefined ? (
        <Button disabled>{t('sharing.groups.pauseOn')}</Button>
      ) : (
        <Button
          disabled={busy}
          onClick={() => {
            onPause(end);
          }}
        >
          {t('sharing.groups.pauseOn')}
        </Button>
      )}
      <Button variant="ghost" onClick={onCancel}>
        {t('sharing.groups.cancel')}
      </Button>
    </div>
  );
}

interface AddMemberProps {
  readonly group: Group;
  readonly candidates: readonly OrgMember[];
  readonly change: GroupChangeViewModel;
}

function AddMember({ group, candidates, change }: AddMemberProps): ReactElement {
  const { t } = useTranslation();
  const [login, setLogin] = useState('');
  const pickId = useId();
  return (
    <form
      className="o-inline"
      onSubmit={(event) => {
        event.preventDefault();
        change.add(group.id, login, () => {
          setLogin('');
        });
      }}
    >
      <label htmlFor={pickId} className="o-field-label">
        {t('sharing.groups.add')}
      </label>
      <select
        id={pickId}
        className="o-input"
        value={login}
        onChange={(event) => {
          setLogin(event.target.value);
        }}
      >
        <option value="">{t('sharing.groups.pickMember')}</option>
        {candidates.map((member) => (
          <option key={member.login} value={member.login}>
            {personOf(member)}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={change.pending || login === ''}>
        {t('sharing.groups.addSubmit')}
      </Button>
    </form>
  );
}
