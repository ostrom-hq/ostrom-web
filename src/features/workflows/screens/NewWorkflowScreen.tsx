// SPDX-License-Identifier: Apache-2.0
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { WorkflowEditor } from '../components/WorkflowEditor';
import { WorkflowFailure } from '../components/WorkflowFailure';
import './workflows.css';
import { workflowIdFor, workflowOf } from '../model';
import { useWorkflowChange, useWorkflows } from '../useWorkflows';

/** Writes a new workflow from the console: a person decides it, so it starts accepted. */
export function NewWorkflowScreen(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workflows, failure, canChange } = useWorkflows();
  const changes = useWorkflowChange();
  return (
    <Screen
      top={
        <Link to="/workflows" className="o-back">
          {t('workflows.detail.back')}
        </Link>
      }
      title={t('workflows.edit.newTitle')}
      lead={t('workflows.lead')}
    >
      {/* The ids already taken come from the list: a new id never lands on another workflow. */}
      <LoadState data={workflows} failure={failure}>
        {(workflows) =>
          canChange ? (
            <>
              {changes.failure === undefined ? null : (
                <WorkflowFailure failure={changes.failure} change={changes.failed} />
              )}
              <WorkflowEditor
                workflow={undefined}
                saving={changes.pending === 'create'}
                onSave={(draft) => {
                  const id = workflowIdFor(
                    draft.name,
                    workflows.map((workflow) => workflow.id),
                  );
                  changes.change(
                    { kind: 'create', workflow: workflowOf(draft, undefined, id, new Date().toISOString()) },
                    () => {
                      void navigate({ to: '/workflows/$workflowId', params: { workflowId: id } });
                    },
                  );
                }}
                onCancel={() => {
                  void navigate({ to: '/workflows' });
                }}
              />
            </>
          ) : (
            <p className="o-screen__lead">{t('workflows.actions.readOnly')}</p>
          )
        }
      </LoadState>
    </Screen>
  );
}
