// SPDX-License-Identifier: Apache-2.0
import type { ApproversGraph } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import {
  type ApprovalPoint,
  blocking,
  busiestFirst,
  isSelfApprovalPolicy,
  readGraph,
  SELF_APPROVAL_POLICIES,
} from '../model';
import { type PolicyViewModel, useApprovers, useSelfApprovalPolicy } from '../useApprovers';

function PointRow({
  point,
  approvers,
  blocks,
  nameOf,
}: {
  readonly point: ApprovalPoint;
  /** Who answers it: the server's reading when it gives one (a node naming nobody may fall back to an approver). */
  readonly approvers: readonly string[];
  /** It stops an agent for good, as the warning above says. */
  readonly blocks: boolean;
  readonly nameOf: (login: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const meta = [
    point.workflowName,
    ...point.actions.map((action) => action.label),
    point.when?.hours === undefined ? undefined : t('approvers.point.hours', { hours: point.when.hours }),
    point.when?.days === undefined ? undefined : t('approvers.point.days', { days: point.when.days }),
    point.enforced ? undefined : t('approvers.point.proposed'),
    // The gates decide on the actions they cover: one that covers none stops nothing.
    point.actions.length === 0 ? t('approvers.point.noAction') : undefined,
  ].filter((part) => part !== undefined);
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{point.label}</span>
        <span className="o-row__meta">{meta.join(' · ')}</span>
        {point.reason === undefined ? null : <span className="o-row__meta">{point.reason}</span>}
      </span>
      {approvers.length === 0 ? (
        <Badge tone={blocks ? 'danger' : 'neutral'}>{t('approvers.point.nobody')}</Badge>
      ) : (
        <span className="o-row__meta">{approvers.map(nameOf).join(', ')}</span>
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

/** What the server's graph warns about: gates that stop an agent for good, and actions no gate covers. */
function GraphNotes({ graph }: { readonly graph: ApproversGraph }): ReactElement {
  const { t } = useTranslation();
  const stuck = blocking(graph.unanswered);
  return (
    <>
      {stuck.length === 0 ? null : (
        <Banner tone="warning" tag={t('approvers.stuck.tag')}>
          {t('approvers.stuck.text', {
            count: stuck.length,
            list: stuck.map((gate) => gate.label).join(', '),
          })}
        </Banner>
      )}
      {graph.ungated.length === 0 ? null : (
        <Banner tone="info" tag={t('approvers.ungated.tag')}>
          {t('approvers.ungated.text', { count: graph.ungated.length, list: graph.ungated.join(', ') })}
        </Banner>
      )}
    </>
  );
}

/** Who approves what, person by person, as the gates decide it; a gate of a proposed workflow says so. */
function People({
  graph,
  nameOf,
}: {
  readonly graph: ApproversGraph;
  readonly nameOf: (login: string) => string;
}): ReactElement | null {
  const { t } = useTranslation();
  const people = busiestFirst(graph.approvers);
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="ap-people" className="o-stack">
      <h2 id="ap-people" className="o-label">
        {t('approvers.people.title')}
      </h2>
      <ul className="o-card o-rows">
        {people.map((person) => (
          <li key={person.approver}>
            <div className="o-row">
              <Avatar login={person.approver} size={32} />
              <span className="o-row__main">
                <span className="o-row__title">{nameOf(person.approver)}</span>
                <span className="o-row__meta">
                  {person.gates
                    .map((gate) =>
                      gate.enforce ? gate.label : t('approvers.people.proposed', { label: gate.label }),
                    )
                    .join(' · ')}
                </span>
              </span>
              <Badge>{t('approvers.people.count', { count: person.gates.length })}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Who may say yes to what: the gates of every workflow, read by gate and by person. */
export function ApproversScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useApprovers();
  const reading = useMemo(() => (view.graph === undefined ? undefined : readGraph(view.graph)), [view.graph]);
  const policy = useSelfApprovalPolicy();
  return (
    <Screen title={t('approvers.title')} lead={t('approvers.lead')}>
      <LoadState data={view.points} failure={view.failure}>
        {(points) => (
          <>
            {view.graph === undefined ? null : <GraphNotes graph={view.graph} />}
            {points.length === 0 ? (
              <p className="o-empty">{t('approvers.empty')}</p>
            ) : (
              <section aria-labelledby="ap-gates" className="o-stack">
                <h2 id="ap-gates" className="o-label">
                  {t('approvers.gates.title')}
                </h2>
                <ul className="o-card o-rows">
                  {points.map((point) => (
                    <li key={point.key}>
                      <PointRow
                        point={point}
                        approvers={reading?.answeredBy.get(point.key) ?? point.approvers}
                        blocks={
                          reading?.blocked.has(point.key) ??
                          // Without the server's reading, the workflow's own: enforced, covering an action, nobody.
                          (point.enforced && point.actions.length > 0 && point.approvers.length === 0)
                        }
                        nameOf={view.nameOf}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {view.graph === undefined ? null : <People graph={view.graph} nameOf={view.nameOf} />}
            {view.graphUnavailable ? <p className="o-row__meta">{t('approvers.graphUnavailable')}</p> : null}
            {view.graphFailure === undefined ? null : (
              <Banner tone="danger" tag={t('approvers.graphFailedTag')} live>
                {view.graphFailure.message}
              </Banner>
            )}
          </>
        )}
      </LoadState>
      <PolicySection policy={policy} />
    </Screen>
  );
}
