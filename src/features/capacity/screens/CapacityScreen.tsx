// SPDX-License-Identifier: Apache-2.0
import type { MemberResponse } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useViewer } from '@/shared/auth/useViewer';
import { useFeature } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { MemberPolicyRow } from '../components/MemberPolicyRow';
import { PoolBudgetForm } from '../components/PoolBudgetForm';
import { byPool, membersByPool } from '../model';
import { useMemberCapacities, useMemberLimits, useMemberPolicies, usePoolBudgets } from '../useCapacity';
import '../capacity.css';

/**
 * TeamCode's capacity page (`/dashboard/capacity`): for an owner or an admin the pool budgets with their shared
 * overflow switch, and each member's weight and pool share, today's spend against their daily limit, their active and
 * waiting requests, daily cap (in dollars), concurrent requests, pool and overflow; for anyone else their own row.
 */
export function CapacityScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('capacity.title')}>
      {(_org, role) => (
        <Screen title={t('capacity.title')} lead={t('capacity.lead')}>
          <Section label={t('capacity.help.title')}>
            <p className="o-row__meta">{t('capacity.help.body')}</p>
          </Section>
          {managesMembers(role) ? <AdminCapacity /> : <OwnCapacity />}
        </Screen>
      )}
    </WithOrg>
  );
}

function nameOf(member: Pick<MemberResponse, 'login' | 'name'>): string {
  return member.name === '' ? member.login : member.name;
}

function AdminCapacity(): ReactElement {
  const { t } = useTranslation();
  const viewer = useViewer();
  const sizing = useFeature('capacity.poolsize.v1');
  const people = useCurrentOrgMembers({ all: true });
  // Someone invited has no policy yet: only the members who joined.
  const members = (people.members ?? []).filter((member) => orgRoleOf(member.role) !== undefined);
  const logins = members.map((member) => member.login);
  const view = useMemberPolicies(logins);
  const capacities = useMemberCapacities(logins);
  const budgets = usePoolBudgets(true);
  const limits = useMemberLimits();
  const counts = view.complete ? membersByPool([...view.policies.values()]) : undefined;
  return (
    <>
      <Section label={t('capacity.pools.title')}>
        {sizing ? (
          <p>
            <Link to="/pool-size">{t('capacity.pools.sizing')}</Link>
          </p>
        ) : null}
        <LoadState data={budgets.budgets} failure={budgets.failure} rows={2}>
          {(list) => (
            <div className="cp-pools">
              {byPool(list).map((budget) => (
                <PoolBudgetForm
                  // A saved budget starts its form again from it, whoever saved it.
                  key={`${budget.poolId}:${String(budget.dailyMicros)}:${String(budget.sharedOverflow)}`}
                  budget={budget}
                  members={counts === undefined ? undefined : (counts.get(budget.poolId) ?? 0)}
                />
              ))}
              <PoolBudgetForm members={undefined} />
            </div>
          )}
        </LoadState>
      </Section>
      <Section label={t('capacity.members.title')}>
        {view.failure === undefined ? null : (
          <Banner tone="warning" tag={t('app.failure.tag')}>
            {view.failure.message}
          </Banner>
        )}
        <LoadState data={people.members} failure={failureOf(people.error)}>
          {() => (
            <div className="o-stack">
              {members.map((member) => (
                <MemberPolicyRow
                  key={member.login}
                  login={member.login}
                  name={nameOf(member)}
                  isViewer={member.login === viewer.login}
                  policy={view.policies.get(member.login)}
                  limits={{ memberId: member.id, ...limits }}
                  capacity={capacities.get(member.login)}
                />
              ))}
            </div>
          )}
        </LoadState>
      </Section>
    </>
  );
}

/** A member who does not administer the organization reads their own pool. */
function OwnCapacity(): ReactElement {
  const { t } = useTranslation();
  const viewer = useViewer();
  // Known once signed in, which a screen of an organization is.
  const logins = [viewer.login].filter((login): login is string => login !== undefined);
  const view = useMemberPolicies(logins);
  const capacities = useMemberCapacities(logins);
  const policy = view.policies.values().next().value;
  return (
    <Section label={t('capacity.members.title')}>
      <LoadState data={policy} failure={view.failure} rows={1}>
        {(own) => (
          <MemberPolicyRow
            login={own.member}
            name={own.member}
            isViewer
            policy={own}
            capacity={capacities.get(own.member)}
          />
        )}
      </LoadState>
    </Section>
  );
}
