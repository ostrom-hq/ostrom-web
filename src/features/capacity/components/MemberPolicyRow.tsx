// SPDX-License-Identifier: Apache-2.0
import type { MemberPolicyResponse } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { homePoolOf } from '../model';
import { useMemberPolicySave } from '../useCapacity';
import { SaveFailure } from './SaveFailure';

export interface MemberPolicyRowProps {
  readonly login: string;
  readonly name: string;
  readonly isViewer: boolean;
  /** Undefined while it is read. */
  readonly policy: MemberPolicyResponse | undefined;
  /** An owner or an admin changes it; anyone else reads their own. */
  readonly editable: boolean;
}

/** A member's pool, as TeamCode's capacity row: the policy form for an administrator, the policy read for the others. */
export function MemberPolicyRow({
  login,
  name,
  isViewer,
  policy,
  editable,
}: MemberPolicyRowProps): ReactElement {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <article className="o-card o-stack" aria-labelledby={headingId}>
      <div className="o-inline">
        <Avatar login={login} size={36} />
        <h3 id={headingId} className="cp-title">
          {name}
          {isViewer ? <span className="o-row__meta"> {t('capacity.members.you')}</span> : null}
        </h3>
      </div>
      {policy === undefined ? (
        <Skeleton rows={1} />
      ) : (
        <>
          <p className="o-row__meta">
            {poolNameOf(policy, t)} ·{' '}
            {policy.allowSharedOverflow
              ? t('capacity.members.overflowOn')
              : t('capacity.members.overflowOff')}
          </p>
          {editable ? <PolicyForm key={policyKey(policy)} login={login} policy={policy} /> : null}
        </>
      )}
    </article>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function poolNameOf(policy: MemberPolicyResponse, t: Translate): string {
  const pool = homePoolOf(policy);
  return pool === '' ? t('capacity.members.shared') : t('capacity.members.named', { pool });
}

/** A saved policy starts the form again from it. */
function policyKey(policy: MemberPolicyResponse): string {
  return `${homePoolOf(policy)}:${String(policy.allowSharedOverflow)}`;
}

/** TeamCode's « Pool (empty = shared) » and « Allow shared overflow accounts » (`PATCH /members/{login}/policy`). */
function PolicyForm({
  login,
  policy,
}: {
  readonly login: string;
  readonly policy: MemberPolicyResponse;
}): ReactElement {
  const { t } = useTranslation();
  const view = useMemberPolicySave(login);
  const [pool, setPool] = useState(homePoolOf(policy));
  const [overflow, setOverflow] = useState(policy.allowSharedOverflow);
  const poolId = useId();
  const changed = pool.trim() !== homePoolOf(policy) || overflow !== policy.allowSharedOverflow;
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        view.save({ poolId: pool.trim(), allowSharedOverflow: overflow });
      }}
    >
      <label htmlFor={poolId} className="o-field-label">
        {t('capacity.members.pool')}
      </label>
      <input
        id={poolId}
        className="o-input"
        autoComplete="off"
        maxLength={36}
        value={pool}
        aria-describedby={`${poolId}-hint`}
        onChange={(event) => {
          setPool(event.target.value);
        }}
      />
      <p id={`${poolId}-hint`} className="o-row__meta">
        {t('capacity.members.poolHint', { pool: poolNameOf(policy, t) })}
      </p>
      <label className="o-inline cp-check">
        <input
          type="checkbox"
          checked={overflow}
          onChange={(event) => {
            setOverflow(event.target.checked);
          }}
        />
        {t('capacity.members.overflow')}
      </label>
      <SaveFailure failure={view.failure} />
      <span className="o-self-start">
        <Button type="submit" disabled={view.saving || !changed}>
          {view.saving ? t('capacity.members.saving') : t('capacity.members.save')}
        </Button>
      </span>
    </form>
  );
}
