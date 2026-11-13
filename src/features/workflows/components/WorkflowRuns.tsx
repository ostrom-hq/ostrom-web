// SPDX-License-Identifier: Apache-2.0
import type { Workflow } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { useStartRun, useWorkflowRuns } from '../useRuns';
import { RunList } from './RunList';

/** A workflow's runs, and for an owner or an admin the button that starts one. */
export function WorkflowRuns({ workflow }: { readonly workflow: Workflow }): ReactElement {
  const { t } = useTranslation();
  const list = useWorkflowRuns(workflow.id);
  const run = useStartRun(workflow);
  return (
    <Section label={t('workflows.runs.title')}>
      {run.canStart ? (
        <div className="o-inline">
          <Button disabled={run.starting} onClick={run.start}>
            {run.starting ? t('workflows.runs.starting') : t('workflows.runs.start')}
          </Button>
        </div>
      ) : null}
      {run.acceptFirst ? <p className="o-screen__lead">{t('workflows.runs.acceptFirst')}</p> : null}
      {run.failure === undefined ? null : (
        <Banner tone="danger" tag={t('workflows.runs.startFailedTag')} live>
          {run.failure.message}
        </Banner>
      )}
      <RunList list={list} withWorkflow={false} />
    </Section>
  );
}
