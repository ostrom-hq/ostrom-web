// SPDX-License-Identifier: Apache-2.0
import type { WorkflowRun } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { knownOr } from '@/shared/lib/openEnum';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { formatAbsolute, formatDuration } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState } from '@/shared/ui/Screen';
import { RUN_TONES, runSource } from '../model';
import { RunFailure } from './RunFailure';
import type { RunListViewModel } from '../useRuns';

/**
 * Runs, newest first, the older ones when asked. `withWorkflow` names each run's workflow and leads to it: the list
 * of every workflow's runs; one workflow's own list says its version instead.
 */
export function RunList({
  list,
  withWorkflow,
}: {
  readonly list: RunListViewModel;
  readonly withWorkflow: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <LoadState data={list.runs} failure={list.failure} rows={2}>
      {(runs) =>
        runs.length === 0 ? (
          <p className="o-empty">{t('workflows.runs.empty')}</p>
        ) : (
          <>
            <ul className="o-card o-rows">
              {runs.map((run) => (
                <li key={run.id}>
                  <RunRow run={run} withWorkflow={withWorkflow} />
                </li>
              ))}
            </ul>
            {list.moreFailure === undefined ? null : (
              <Banner tone="warning" tag={t('app.failure.tag')} live>
                {list.moreFailure.message}
              </Banner>
            )}
            {list.more ? (
              <Button disabled={list.loadingMore} onClick={list.loadMore}>
                {list.loadingMore ? t('workflows.runs.loadingMore') : t('workflows.runs.more')}
              </Button>
            ) : null}
          </>
        )
      }
    </LoadState>
  );
}

function RunRow({
  run,
  withWorkflow,
}: {
  readonly run: WorkflowRun;
  readonly withWorkflow: boolean;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const source = runSource(run.source);
  return (
    <div className="o-row">
      <Badge tone={knownOr(RUN_TONES, run.status, 'neutral')}>
        {enumText('workflows.runs.status', run.status)}
      </Badge>
      <span className="o-row__main">
        <span className="o-row__title">
          {withWorkflow ? (
            <Link to="/workflows/$workflowId" params={{ workflowId: run.workflowId }}>
              {run.workflowName}
            </Link>
          ) : (
            t('workflows.runs.version', { version: run.workflowVersion })
          )}{' '}
          <Link to="/runs/$runId" params={{ runId: run.id }} className="o-row__meta">
            {t('workflows.runs.details')}
          </Link>
        </span>
        <span className="o-row__meta">
          {[
            t('workflows.runs.by', { who: run.startedBy }),
            t(`workflows.runs.source.${source}`, { source: run.source }),
          ].join(' · ')}
        </span>
        <RunFailure run={run} />
        {run.sessionId === undefined ? null : (
          <Link to="/sessions/$sessionId" params={{ sessionId: run.sessionId }} className="o-row__meta">
            {t('workflows.runs.session')}
          </Link>
        )}
      </span>
      {/* When it started, and how long it took once it ended. */}
      <span className="o-row__end">
        <time dateTime={run.startedAt}>{formatAbsolute(run.startedAt, i18n.language)}</time>
        {run.endedAt === undefined ? null : ` · ${formatDuration(run.startedAt, run.endedAt, i18n.language)}`}
      </span>
    </div>
  );
}
