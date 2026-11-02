// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { WorkflowEditor } from '../components/WorkflowEditor';
import { WorkflowFailure } from '../components/WorkflowFailure';
import './workflows.css';
import { readSteps, STATUS_TONES, type Step, workflowOf } from '../model';
import { useWorkflow, useWorkflowChange, type WorkflowChangeViewModel } from '../useWorkflows';

export function WorkflowScreen(): ReactElement {
  const { t } = useTranslation();
  const { workflowId } = useParams({ from: '/workflows/$workflowId' });
  const { workflow, failure, canChange } = useWorkflow(workflowId);
  const changes = useWorkflowChange();
  // The version the editor started from: a save is checked against it, so a version saved in between is a conflict,
  // never overwritten, even once the screen has read it.
  const [editing, setEditing] = useState<{ readonly from: number | undefined } | undefined>(undefined);
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
          {changes.failure === undefined ? null : (
            <WorkflowFailure failure={changes.failure} creating={false} />
          )}
          {editing !== undefined ? (
            <WorkflowEditor
              workflow={workflow}
              saving={changes.pending === 'save'}
              onSave={(draft) => {
                changes.change(
                  {
                    kind: 'save',
                    workflow: workflowOf(draft, workflow, workflow.id, new Date().toISOString()),
                    expectedVersion: editing.from,
                  },
                  () => {
                    setEditing(undefined);
                  },
                );
              }}
              onCancel={() => {
                changes.reset();
                setEditing(undefined);
              }}
            />
          ) : (
            <>
              {canChange ? (
                <WorkflowActions
                  workflow={workflow}
                  changes={changes}
                  onEdit={() => {
                    changes.reset();
                    setEditing({ from: workflow.version });
                  }}
                />
              ) : (
                <p className="o-screen__lead">{t('workflows.actions.readOnly')}</p>
              )}
              <WorkflowDetail workflow={workflow} />
            </>
          )}
        </Screen>
      )}
    </LoadState>
  );
}

/** Edit, accept a proposed workflow as found, or delete it (two clicks). */
function WorkflowActions({
  workflow,
  changes,
  onEdit,
}: {
  readonly workflow: Workflow;
  readonly changes: WorkflowChangeViewModel;
  readonly onEdit: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const busy = changes.pending !== undefined;
  return (
    <div className="o-inline wf-actions">
      <Button disabled={busy} onClick={onEdit}>
        {t('workflows.actions.edit')}
      </Button>
      {workflow.status === 'proposed' ? (
        <Button
          disabled={busy}
          onClick={() => {
            changes.change(
              {
                kind: 'save',
                workflow: { ...workflow, status: 'accepted' },
                expectedVersion: workflow.version,
              },
              () => undefined,
            );
          }}
        >
          {changes.pending === 'save' ? t('workflows.actions.accepting') : t('workflows.actions.accept')}
        </Button>
      ) : null}
      <ConfirmButton
        label={changes.pending === 'delete' ? t('workflows.actions.deleting') : t('workflows.actions.delete')}
        confirm={t('workflows.actions.deleteConfirm')}
        keep={t('workflows.actions.keep')}
        disabled={busy}
        onConfirm={() => {
          changes.change({ kind: 'delete', id: workflow.id }, () => {
            void navigate({ to: '/workflows' });
          });
        }}
      />
      <p className="o-screen__lead wf-actions__lead">{t('workflows.actions.deleteLead')}</p>
    </div>
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
