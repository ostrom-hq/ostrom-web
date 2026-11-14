// SPDX-License-Identifier: Apache-2.0
import type { OrgMember } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import type { OrgMembers } from '@/shared/org/members';
import { Button } from '@/shared/ui/Button';
import { MorePeople } from '@/shared/ui/MorePeople';
import { checkAssignment, EVERYONE, memberLabel } from '../model';
import type { ServerAccessChangeViewModel } from '../useMcpAccess';

/** The choice that reveals a field for a member id, when the member is not in the list. */
const BY_ID = 'by-id';

export interface AssignFormProps {
  readonly server: string;
  /** The members to pick from; without them, a member is given by id. */
  readonly members: readonly OrgMember[] | undefined;
  /** The next page of members, read when asked. */
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore'>;
  readonly change: ServerAccessChangeViewModel;
}

/** Gives the server to everyone or to one member, with every tool or an allowlist. */
export function AssignForm({ server, members, people, change }: AssignFormProps): ReactElement {
  const { t } = useTranslation();
  const [who, setWho] = useState(EVERYONE);
  const [memberId, setMemberId] = useState('');
  const [onlySome, setOnlySome] = useState(false);
  const [tools, setTools] = useState('');
  // A credential is typed for one choice of member: it is kept with that choice and never follows to another. Typing
  // a member's id is one choice ("by id"), so a credential typed before the id stays while the id is typed.
  const [typed, setTyped] = useState({ choice: '', value: '' });
  const [tried, setTried] = useState(false);
  const ids = { who: useId(), id: useId(), mode: useId(), tools: useId(), credential: useId() };
  const member = who === BY_ID ? memberId : who;
  const credential = typed.choice === who ? typed.value : '';
  const checked = checkAssignment({ member, onlySome, tools, credentialSecret: credential });
  // An invitation not accepted yet has no account to give a server to.
  const candidates = (members ?? []).filter((item) => item.role !== 'invited');
  return (
    <form
      className="o-stack"
      aria-label={t('tools.mcp.access.assign.title', { server })}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if ('request' in checked)
          change.assign(checked.member, checked.request, () => {
            setWho(EVERYONE);
            setMemberId('');
            setOnlySome(false);
            setTools('');
            setTyped({ choice: '', value: '' });
            setTried(false);
          });
      }}
    >
      <div className="o-inline">
        <label htmlFor={ids.who} className="o-field-label">
          {t('tools.mcp.access.assign.who')}
        </label>
        <select
          id={ids.who}
          className="o-input o-select"
          value={who}
          onChange={(event) => {
            setWho(event.target.value);
          }}
        >
          <option value={EVERYONE}>{t('tools.mcp.access.everyone')}</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {memberLabel(item)}
            </option>
          ))}
          <option value={BY_ID}>{t('tools.mcp.access.assign.byId')}</option>
        </select>
        <MorePeople people={people} />
      </div>
      {who === BY_ID ? (
        <>
          <label htmlFor={ids.id} className="o-field-label">
            {t('tools.mcp.access.assign.memberId')}
          </label>
          <input
            id={ids.id}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            value={memberId}
            onChange={(event) => {
              setMemberId(event.target.value);
            }}
          />
        </>
      ) : null}
      <div className="o-inline">
        <label htmlFor={ids.mode} className="o-field-label">
          {t('tools.mcp.access.assign.mode')}
        </label>
        <select
          id={ids.mode}
          className="o-input o-select"
          value={onlySome ? 'some' : 'all'}
          onChange={(event) => {
            setOnlySome(event.target.value === 'some');
          }}
        >
          <option value="all">{t('tools.mcp.access.assign.allTools')}</option>
          <option value="some">{t('tools.mcp.access.assign.someTools')}</option>
        </select>
      </div>
      {onlySome ? (
        <>
          <label htmlFor={ids.tools} className="o-field-label">
            {t('tools.mcp.access.assign.tools')}
          </label>
          <input
            id={ids.tools}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder="list_issues, create_issue"
            value={tools}
            onChange={(event) => {
              setTools(event.target.value);
            }}
          />
        </>
      ) : null}
      {who === EVERYONE ? null : (
        <>
          <label htmlFor={ids.credential} className="o-field-label">
            {t('tools.mcp.access.assign.credential')}
          </label>
          <input
            id={ids.credential}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder="LINEAR_TOKEN"
            value={credential}
            onChange={(event) => {
              setTyped({ choice: who, value: event.target.value });
            }}
          />
        </>
      )}
      {tried && 'problem' in checked ? (
        <Banner tone="warning" tag={t('tools.mcp.add.problemTag')} live>
          {t(`tools.mcp.access.assign.problem.${checked.problem}`, { detail: checked.detail ?? '' })}
        </Banner>
      ) : null}
      <div className="o-inline">
        <Button type="submit" disabled={change.pending}>
          {t('tools.mcp.access.assign.submit')}
        </Button>
      </div>
    </form>
  );
}
