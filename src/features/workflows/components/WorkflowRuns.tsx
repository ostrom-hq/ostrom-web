// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { useStartRun, useWorkflowRuns } from '../useRuns';
import { RunList } from './RunList';

/** A workflow's runs, and for an owner or an admin the button that starts one. */
export function WorkflowRuns({ workflowId }: { readonly workflowId: string }): ReactElement {
  const { t } = useTranslation();
  const list = useWorkflowRuns(workflowId);
  const run = useStartRun(workflowId);
  return (
    <Section label={t('workflows.runs.title')}>
      {run.canStart ? (
        <div className="o-inline">
          <Button disabled={run.starting} onClick={run.start}>
            {run.starting ? t('workflows.runs.starting') : t('workflows.runs.start')}
          </Button>
        </div>
      ) : null}
      {run.failure === undefined ? null : (
        <Banner tone="danger" tag={t('workflows.runs.startFailedTag')} live>
          {run.failure.message}
        </Banner>
      )}
      <RunList list={list} withWorkflow={false} />
    </Section>
  );
}
