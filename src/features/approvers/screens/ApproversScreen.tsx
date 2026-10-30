// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { type ApprovalPoint, isSelfApprovalPolicy, SELF_APPROVAL_POLICIES, unanswerable } from '../model';
import { type PolicyViewModel, useApprovers, useSelfApprovalPolicy } from '../useApprovers';

function PointRow({
  point,
  nameOf,
}: {
  readonly point: ApprovalPoint;
  readonly nameOf: (login: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const meta = [
    point.workflowName,
    ...point.actions.map((action) => action.label),
    point.when?.hours === undefined ? undefined : t('approvers.point.hours', { hours: point.when.hours }),
    point.when?.days === undefined ? undefined : t('approvers.point.days', { days: point.when.days }),
  ].filter((part) => part !== undefined);
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{point.label}</span>
        <span className="o-row__meta">{meta.join(' · ')}</span>
        {point.reason === undefined ? null : <span className="o-row__meta">{point.reason}</span>}
      </span>
      {point.approvers.length === 0 ? (
        <Badge tone="danger">{t('approvers.point.nobody')}</Badge>
      ) : (
        <span className="o-row__meta">{point.approvers.map(nameOf).join(', ')}</span>
      )}
    </div>
  );
}

function PolicySection({ policy }: { readonly policy: PolicyViewModel }): ReactElement | null {
  const { t } = useTranslation();
  const selectId = useId();
  if (policy.policy === undefined) return null;
  const current = policy.policy;
  return (
    <Section label={t('approvers.policy.title')}>
      <p>{isSelfApprovalPolicy(current) ? t(`approvers.policy.says.${current}`) : current}</p>
      {policy.canEdit ? (
        <div className="o-inline">
          <label htmlFor={selectId} className="o-field-label">
            {t('approvers.policy.label')}
          </label>
          <select
            id={selectId}
            className="o-input o-select"
            value={current}
            disabled={policy.saving}
            onChange={(event) => {
              if (isSelfApprovalPolicy(event.target.value)) policy.set(event.target.value);
            }}
          >
            {SELF_APPROVAL_POLICIES.map((option) => (
              <option key={option} value={option}>
                {t(`approvers.policy.option.${option}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {policy.failure === undefined ? null : (
        <Banner tone="danger" tag={t('approvers.policy.errorTag')} live>
          {policy.failure.message}
        </Banner>
      )}
    </Section>
  );
}

/** Who may say yes to what: the gates of every workflow, read by gate and by person. */
export function ApproversScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useApprovers();
  const policy = useSelfApprovalPolicy();
  return (
    <Screen title={t('approvers.title')} lead={t('approvers.lead')}>
      <LoadState data={view.points} failure={view.failure}>
        {(points) => {
          const stuck = unanswerable(points);
          return points.length === 0 ? (
            <p className="o-empty">{t('approvers.empty')}</p>
          ) : (
            <>
              {stuck.length === 0 ? null : (
                <Banner tone="warning" tag={t('approvers.stuck.tag')}>
                  {t('approvers.stuck.text', { count: stuck.length, list: stuck.map((p) => p.label).join(', ') })}
                </Banner>
              )}
              <section aria-labelledby="ap-gates" className="o-stack">
                <h2 id="ap-gates" className="o-label">
                  {t('approvers.gates.title')}
                </h2>
                <ul className="o-card o-rows">
                  {points.map((point) => (
                    <li key={point.key}>
                      <PointRow point={point} nameOf={view.nameOf} />
                    </li>
                  ))}
                </ul>
              </section>
              {view.people === undefined || view.people.length === 0 ? null : (
                <section aria-labelledby="ap-people" className="o-stack">
                  <h2 id="ap-people" className="o-label">
                    {t('approvers.people.title')}
                  </h2>
                  <ul className="o-card o-rows">
                    {view.people.map((person) => (
                      <li key={person.login}>
                        <div className="o-row">
                          <Avatar login={person.login} size={32} />
                          <span className="o-row__main">
                            <span className="o-row__title">{view.nameOf(person.login)}</span>
                            <span className="o-row__meta">
                              {person.points.map((point) => point.label).join(' · ')}
                            </span>
                          </span>
                          <Badge>{t('approvers.people.count', { count: person.points.length })}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          );
        }}
      </LoadState>
      <PolicySection policy={policy} />
    </Screen>
  );
}
