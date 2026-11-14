// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: Apache-2.0
import type { Workflow } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { knownOr } from '@/shared/lib/openEnum';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Badge } from '@/shared/ui/Badge';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { approvalSteps, reposText, STATUS_TONES } from '../model';
import { useWorkflows } from '../useWorkflows';
import './workflows.css';

export function WorkflowsScreen(): ReactElement {
  const { t } = useTranslation();
  const { workflows, failure, canChange } = useWorkflows();
  return (
    <Screen title={t('workflows.title')} lead={t('workflows.lead')}>
      {canChange ? (
        <Link to="/workflows/new" className="o-btn o-btn--secondary o-btn--md o-self-start">
          {t('workflows.edit.new')}
        </Link>
      ) : null}
      <LoadState data={workflows} failure={failure}>
        {(workflows) => {
          const rejected = workflows.filter((workflow) => workflow.status === 'rejected');
          const kept = workflows.filter((workflow) => workflow.status !== 'rejected');
          return (
            <>
              {workflows.length === 0 ? <p className="o-empty">{t('workflows.empty')}</p> : null}
              {kept.length === 0 ? null : <WorkflowRows workflows={kept} />}
              {rejected.length === 0 ? null : (
                <section className="o-stack" aria-label={t('workflows.list.rejectedTitle')}>
                  <h2 className="o-label">{t('workflows.list.rejectedTitle')}</h2>
                  <p className="o-screen__lead">{t('workflows.list.rejectedLead')}</p>
                  <WorkflowRows workflows={rejected} grey />
                </section>
              )}
            </>
          );
        }}
      </LoadState>
    </Screen>
  );
}

/** The workflows as rows; a rejected one is greyed, and leads to its page all the same (to delete it). */
function WorkflowRows({
  workflows,
  grey = false,
}: {
  readonly workflows: readonly Workflow[];
  readonly grey?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  return (
    <ul className="o-card o-rows">
      {workflows.map((workflow) => (
        <li key={workflow.id} className={grey ? 'wf-rejected' : undefined}>
          <Link className="o-row" to="/workflows/$workflowId" params={{ workflowId: workflow.id }}>
            <span className="o-row__main">
              <span className="o-row__title">{workflow.name}</span>
              <span className="o-row__meta">
                {[
                  workflow.domain,
                  reposText(workflow) ?? t('workflows.list.allRepos'),
                  t('workflows.list.steps', { count: workflow.nodes.length }),
                  t('workflows.list.approvals', { count: approvalSteps(workflow) }),
                ].join(' · ')}
              </span>
            </span>
            <Badge tone={knownOr(STATUS_TONES, workflow.status, 'neutral')}>
              {enumText('workflows.status', workflow.status)}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
