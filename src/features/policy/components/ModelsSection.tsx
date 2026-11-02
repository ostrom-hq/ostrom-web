// SPDX-License-Identifier: AGPL-3.0-only
import type { Member, ModelPolicy } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  addMemberRow,
  type MemberModels,
  memberName,
  policyDraftOf,
  policyOf,
  policyProblem,
  type PolicyDraft,
} from '../model';
import type { ModelPolicyViewModel, SaveViewModel } from '../usePolicy';

/** The policy as everyone reads it: which models, the default, and the members with a list of their own. */
function PolicyFacts({
  policy,
  members,
}: {
  readonly policy: ModelPolicy;
  readonly members: readonly Member[] | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const own = Object.entries(policy.byMember ?? {});
  return (
    <dl className="o-facts">
      <div className="o-facts__row">
        <dt>{t('policy.models.allowed')}</dt>
        <dd className="o-mono">
          {policy.allowed.length === 0 ? t('policy.models.every') : policy.allowed.join(', ')}
        </dd>
      </div>
      <div className="o-facts__row">
        <dt>{t('policy.models.default')}</dt>
        <dd className="o-mono">{policy.default === '' ? t('policy.models.noDefault') : policy.default}</dd>
      </div>
      {own.map(([member, models]) => (
        <div key={member} className="o-facts__row">
          <dt>{t('policy.models.memberNamed', { member: memberName(member, members) })}</dt>
          <dd className="o-mono">{models.join(', ')}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Who a row names: picked among the members when they are known, typed as an id when they are not. */
function MemberPicker({
  row,
  number,
  members,
  onChange,
}: {
  readonly row: MemberModels;
  readonly number: number;
  readonly members: readonly Member[] | undefined;
  readonly onChange: (member: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const label = t('policy.models.member', { number });
  if (members === undefined)
    return (
      <input
        className="o-input o-mono"
        aria-label={label}
        placeholder={t('policy.models.memberIdPlaceholder')}
        value={row.member}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    );
  // An invitation not accepted yet has no account to run agents with.
  const candidates = members.filter((member) => member.role !== 'invited');
  const gone = row.member !== '' && !candidates.some((member) => member.id === row.member);
  return (
    <select
      className="o-input o-select"
      aria-label={label}
      value={row.member}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">{t('policy.models.pickMember')}</option>
      {candidates.map((member) => (
        <option key={member.id} value={member.id}>
          {memberName(member.id, members)}
        </option>
      ))}
      {gone ? <option value={row.member}>{memberName(row.member, members)}</option> : null}
    </select>
  );
}

function PolicyForm({
  policy,
  members,
  change,
  onDone,
}: {
  readonly policy: ModelPolicy;
  readonly members: readonly Member[] | undefined;
  readonly change: SaveViewModel<ModelPolicy>;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PolicyDraft>(() => policyDraftOf(policy));
  const allowedId = useId();
  const defaultId = useId();
  const problem = policyProblem(draft);
  const setRow = (key: number, next: Partial<MemberModels>): void => {
    setDraft((current) => ({
      ...current,
      byMember: current.byMember.map((row) => (row.key === key ? { ...row, ...next } : row)),
    }));
  };
  return (
    <form
      className="o-stack pl-form"
      onSubmit={(event) => {
        event.preventDefault();
        change.save(policyOf(draft), onDone);
      }}
    >
      <label htmlFor={allowedId} className="o-field-label">
        {t('policy.models.allowed')}
      </label>
      <input
        id={allowedId}
        className="o-input o-mono"
        placeholder={t('policy.models.allowedPlaceholder')}
        value={draft.allowed}
        onChange={(event) => {
          setDraft({ ...draft, allowed: event.target.value });
        }}
      />
      <p className="o-screen__lead">{t('policy.models.allowedHint')}</p>
      <label htmlFor={defaultId} className="o-field-label">
        {t('policy.models.default')}
      </label>
      <input
        id={defaultId}
        className="o-input o-mono"
        placeholder={t('policy.models.defaultPlaceholder')}
        value={draft.defaultModel}
        onChange={(event) => {
          setDraft({ ...draft, defaultModel: event.target.value });
        }}
      />
      <fieldset className="o-stack pl-members">
        <legend className="o-field-label">{t('policy.models.members')}</legend>
        <p className="o-screen__lead">{t('policy.models.membersHint')}</p>
        {draft.byMember.map((row, index) => (
          <div key={row.key} className="o-inline pl-member">
            <MemberPicker
              row={row}
              number={index + 1}
              members={members}
              onChange={(member) => {
                setRow(row.key, { member });
              }}
            />
            <input
              className="o-input o-mono"
              aria-label={t('policy.models.memberModels', { number: index + 1 })}
              placeholder={t('policy.models.allowedPlaceholder')}
              value={row.models}
              onChange={(event) => {
                setRow(row.key, { models: event.target.value });
              }}
            />
            <Button
              variant="ghost"
              aria-label={t('policy.models.removeMember', { number: index + 1 })}
              onClick={() => {
                setDraft({ ...draft, byMember: draft.byMember.filter((other) => other.key !== row.key) });
              }}
            >
              {t('policy.remove')}
            </Button>
          </div>
        ))}
        <span className="o-self-start">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft({ ...draft, byMember: addMemberRow(draft.byMember) });
            }}
          >
            {t('policy.models.addMember')}
          </Button>
        </span>
      </fieldset>
      {problem === undefined ? null : <p className="o-screen__lead">{t(`policy.models.problem.${problem}`)}</p>}
      <div className="o-inline">
        <Button type="submit" disabled={change.saving || problem !== undefined}>
          {change.saving ? t('policy.saving') : t('policy.save')}
        </Button>
        <Button variant="ghost" disabled={change.saving} onClick={onDone}>
          {t('policy.cancel')}
        </Button>
      </div>
    </form>
  );
}

export interface ModelsSectionProps {
  readonly view: ModelPolicyViewModel;
  /** Owners and admins change the policy; everyone reads it. */
  readonly canChange: boolean;
}

/** Which models the organization's agents may use, the one they get by default, and the members with their own list. */
export function ModelsSection({ view, canChange }: ModelsSectionProps): ReactElement {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const { change } = view;
  return (
    <Section label={t('policy.models.title')}>
      <p className="o-screen__lead">{t('policy.models.lead')}</p>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('policy.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {change.saved && !editing ? (
        <Banner tag={t('policy.savedTag')} live>
          {t('policy.models.saved')}
        </Banner>
      ) : null}
      <LoadState data={view.policy} failure={view.failure}>
        {(loaded) =>
          editing ? (
            <PolicyForm
              policy={loaded}
              members={view.members}
              change={change}
              onDone={() => {
                setEditing(false);
              }}
            />
          ) : (
            <>
              <PolicyFacts policy={loaded} members={view.members} />
              {canChange ? (
                <span className="o-self-start">
                  <Button
                    onClick={() => {
                      setEditing(true);
                    }}
                  >
                    {t('policy.change')}
                  </Button>
                </span>
              ) : (
                <p className="o-screen__lead">{t('policy.models.readOnly')}</p>
              )}
            </>
          )
        }
      </LoadState>
    </Section>
  );
}
