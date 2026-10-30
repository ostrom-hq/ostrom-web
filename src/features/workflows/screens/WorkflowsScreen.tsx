// SPDX-License-Identifier: AGPL-3.0-only
import { listWorkflowsOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { failureOf } from '@/shared/api/failureOf';
import { Badge } from '@/shared/ui/Badge';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { approvalSteps, STATUS_TONES } from '../model';

export function WorkflowsScreen(): ReactElement {
  const { t } = useTranslation();
  const query = useQuery(listWorkflowsOptions());
  return (
    <Screen title={t('workflows.title')} lead={t('workflows.lead')}>
      <LoadState data={query.data?.items} failure={failureOf(query.error)}>
        {(workflows) =>
          workflows.length === 0 ? (
            <p className="o-empty">{t('workflows.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {workflows.map((workflow) => (
                <li key={workflow.id}>
                  <Link className="o-row" to="/workflows/$workflowId" params={{ workflowId: workflow.id }}>
                    <span className="o-row__main">
                      <span className="o-row__title">{workflow.name}</span>
                      <span className="o-row__meta">
                        {[
                          workflow.domain,
                          t('workflows.list.steps', { count: workflow.nodes.length }),
                          t('workflows.list.approvals', { count: approvalSteps(workflow) }),
                        ].join(' · ')}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONES[workflow.status]}>
                      {t(`workflows.status.${workflow.status}`)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Screen>
  );
}
