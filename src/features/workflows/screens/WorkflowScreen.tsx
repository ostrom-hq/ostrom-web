// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { readSteps, STATUS_TONES, type Step } from '../model';
import { useWorkflow } from '../useWorkflows';

export function WorkflowScreen(): ReactElement {
  const { t } = useTranslation();
  const { workflowId } = useParams({ from: '/workflows/$workflowId' });
  const { workflow, failure } = useWorkflow(workflowId);
  return (
    <LoadState data={workflow} failure={failure} rows={2}>
      {(workflow) => (
        <Screen
          top={
            <>
              <Link to="/workflows" className="o-back">
                {t('workflows.detail.back')}
              </Link>
              <Badge tone={STATUS_TONES[workflow.status]}>{t(`workflows.status.${workflow.status}`)}</Badge>
            </>
          }
          title={workflow.name}
          lead={workflow.description}
        >
          <WorkflowDetail workflow={workflow} />
        </Screen>
      )}
    </LoadState>
  );
}

function WorkflowDetail({ workflow }: { readonly workflow: Workflow }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <>
      <Facts
        facts={[
          { label: t('workflows.detail.domain'), value: workflow.domain, mono: true },
          workflow.version === undefined
            ? undefined
            : { label: t('workflows.detail.version'), value: String(workflow.version) },
          workflow.updatedAt === undefined
            ? undefined
            : {
                label: t('workflows.detail.updated'),
                value: [workflow.updatedBy, formatAbsolute(workflow.updatedAt, i18n.language)]
                  .filter((part) => part !== undefined)
                  .join(' · '),
              },
        ]}
      />
      <Section label={t('workflows.detail.steps')}>
        {workflow.nodes.length === 0 ? (
          <p className="o-empty">{t('workflows.detail.noSteps')}</p>
        ) : (
          <ol className="o-card o-rows">
            {readSteps(workflow).map((step) => (
              <li key={step.node.id}>
                <StepRow step={step} />
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function StepRow({ step }: { readonly step: Step }): ReactElement {
  const { t } = useTranslation();
  const { node } = step;
  const approvers = node.approvers ?? [];
  const lines = [
    node.detail,
    node.kind !== 'gate'
      ? undefined
      : approvers.length === 0
        ? t('workflows.step.nobody')
        : t('workflows.step.approvers', { list: approvers.join(', ') }),
    node.approverReason,
    node.when?.hours === undefined ? undefined : t('workflows.step.hours', { hours: node.when.hours }),
    node.when?.days === undefined ? undefined : t('workflows.step.days', { days: node.when.days }),
    node.ruleIds === undefined || node.ruleIds.length === 0
      ? undefined
      : t('workflows.step.rules', { list: node.ruleIds.join(', ') }),
    ...step.next.map(({ to, edge }) => {
      const when = edge.label ?? edge.on;
      const target = to === undefined ? t('workflows.step.end') : to.label;
      return when === undefined
        ? t('workflows.step.then', { target })
        : t('workflows.step.when', { when, target });
    }),
  ].filter((line) => line !== undefined);
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{node.label}</span>
        {lines.map((line) => (
          <span key={line} className="o-row__meta">
            {line}
          </span>
        ))}
      </span>
      <Badge tone={node.kind === 'gate' && approvers.length === 0 ? 'danger' : 'neutral'}>
        {t(`workflows.kind.${node.kind}`)}
      </Badge>
    </div>
  );
}
