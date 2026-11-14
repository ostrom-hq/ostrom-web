// SPDX-License-Identifier: Apache-2.0
import type { NodeVisit, WorkflowRun } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { knownOr } from '@/shared/lib/openEnum';
import { useAnnounced } from '@/shared/capabilities';
import { formatAbsolute, formatDuration } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { DeliverForm } from '../components/DeliverForm';
import { RunFailure } from '../components/RunFailure';
import { RUN_TONES, runSource } from '../model';
import { deliverableOf, deliveryVisit, finished } from '../runs';
import { useRun, useRunActions } from '../useRuns';

export function RunScreen(): ReactElement {
  const { runId } = useParams({ from: '/runs/$runId' });
  return <RunView key={runId} runId={runId} />;
}

function RunView({ runId }: { readonly runId: string }): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  const view = useRun(runId);
  return (
    <LoadState data={view.run} failure={view.failure} rows={2}>
      {(run) => (
        <Screen
          top={
            <>
              <Link to="/runs" className="o-back">
                {t('workflows.runs.back')}
              </Link>
              <Badge tone={knownOr(RUN_TONES, run.status, 'neutral')}>
                {enumText('workflows.runs.status', run.status)}
              </Badge>
            </>
          }
          title={run.workflowName}
          lead={t('workflows.runs.version', { version: run.workflowVersion })}
        >
          <RunDetail run={run} view={view} />
        </Screen>
      )}
    </LoadState>
  );
}

function RunDetail({
  run,
  view,
}: {
  readonly run: WorkflowRun;
  readonly view: ReturnType<typeof useRun>;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const actions = useRunActions(run, view.workflow);
  const delivers = useAnnounced('workflows.deliver.v1');
  const visit = deliveryVisit(run);
  const deliverable = visit === undefined ? undefined : deliverableOf(view.workflow, visit);
  const source = runSource(run.source);
  const inputs = Object.entries(run.inputs ?? {});
  return (
    <>
      <RunBanners run={run} />
      {view.canCancel ? (
        <div className="o-inline">
          <ConfirmButton
            label={actions.cancelling ? t('workflows.runs.cancelling') : t('workflows.runs.cancel')}
            confirm={t('workflows.runs.cancelConfirm')}
            keep={t('workflows.actions.keep')}
            disabled={actions.cancelling}
            onConfirm={actions.cancel}
          />
        </div>
      ) : null}
      {actions.cancelFailure === undefined ? null : (
        <Banner tone="danger" tag={t('workflows.runs.cancelFailedTag')} live>
          {actions.cancelFailure.message}
        </Banner>
      )}
      {delivers &&
      view.isStarter &&
      visit !== undefined &&
      deliverable !== undefined &&
      !actions.delivered ? (
        <DeliverForm
          run={run}
          deliverable={deliverable}
          title={visit.nodeTitle ?? visit.nodeId}
          actions={actions}
        />
      ) : null}
      <Facts
        facts={[
          {
            label: t('workflows.runs.workflow'),
            value: (
              <Link to="/workflows/$workflowId" params={{ workflowId: run.workflowId }}>
                {run.workflowName}
              </Link>
            ),
          },
          { label: t('workflows.runs.startedBy'), value: run.startedBy },
          {
            label: t('workflows.runs.sourceLabel'),
            value: t(`workflows.runs.source.${source}`, { source: run.source }),
          },
          run.repository === undefined
            ? undefined
            : { label: t('workflows.runs.repository'), value: run.repository, mono: true },
          run.currentNodeId === undefined || finished(run)
            ? undefined
            : { label: t('workflows.runs.current'), value: currentTitle(run, run.currentNodeId) },
          {
            label: t('workflows.runs.started'),
            value: formatAbsolute(run.startedAt, i18n.language),
          },
          run.endedAt === undefined
            ? undefined
            : {
                label: t('workflows.runs.took'),
                value: formatDuration(run.startedAt, run.endedAt, i18n.language),
              },
          run.sessionId === undefined
            ? undefined
            : {
                label: t('workflows.runs.session'),
                value: (
                  <Link to="/sessions/$sessionId" params={{ sessionId: run.sessionId }}>
                    {run.sessionId}
                  </Link>
                ),
              },
          run.parentRunId === undefined
            ? undefined
            : {
                label: t('workflows.runs.parent'),
                value: (
                  <Link to="/runs/$runId" params={{ runId: run.parentRunId }}>
                    {run.parentRunId}
                  </Link>
                ),
              },
        ]}
      />
      {inputs.length === 0 ? null : (
        <Section label={t('workflows.runs.inputs')}>
          <Facts facts={inputs.map(([name, value]) => ({ label: name, value, mono: true }))} />
        </Section>
      )}
      {run.output === undefined ? null : (
        <Section label={t('workflows.runs.output')}>
          <pre className="o-mono wf-output">{run.output}</pre>
        </Section>
      )}
      <Section label={t('workflows.runs.visits')}>
        {run.visits === undefined || run.visits.length === 0 ? (
          <p className="o-empty">{t('workflows.runs.noVisits')}</p>
        ) : (
          <ol className="o-card o-rows">
            {run.visits.map((one) => (
              <li key={one.seq}>
                <VisitRow visit={one} />
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

/** What a run says about its end, and what it waits for. */
function RunBanners({ run }: { readonly run: WorkflowRun }): ReactElement | null {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  if (run.status === 'waiting') {
    const waiting = run.visits?.findLast((visit) => visit.kind === 'wait' && visit.endedAt === undefined);
    return (
      <Banner tone="warning" tag={t('workflows.runs.status.waiting')}>
        {waiting?.waitId === undefined ? (
          t('workflows.runs.waitingLead')
        ) : (
          <>
            {t('workflows.runs.waitingLead')}{' '}
            <Link to="/waits/$waitId" params={{ waitId: waiting.waitId }}>
              {t('workflows.runs.answerWait')}
            </Link>
          </>
        )}
      </Banner>
    );
  }
  if (run.status !== 'failed' && run.status !== 'cancelled') return null;
  return (
    <Banner
      tone={run.status === 'failed' ? 'danger' : 'warning'}
      tag={enumText('workflows.runs.status', run.status)}
    >
      <span className="o-stack">
        <RunFailure run={run} />
      </span>
    </Banner>
  );
}

/** The step a run is at: the title of its open visit, else the id of its current node. */
function currentTitle(run: WorkflowRun, nodeId: string): string {
  const open = run.visits?.findLast((visit) => visit.endedAt === undefined);
  return open?.nodeTitle ?? nodeId;
}

function VisitRow({ visit }: { readonly visit: NodeVisit }): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const lines = [
    visit.outcome === undefined ? undefined : t('workflows.runs.outcome', { outcome: visit.outcome }),
    visit.output,
  ].filter((line) => line !== undefined);
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{visit.nodeTitle ?? visit.nodeId}</span>
        {lines.map((line) => (
          <span key={line} className="o-row__meta">
            {line}
          </span>
        ))}
        {visit.sessionId === undefined ? null : (
          <Link to="/sessions/$sessionId" params={{ sessionId: visit.sessionId }} className="o-row__meta">
            {t('workflows.runs.session')}
          </Link>
        )}
        {visit.childRunId === undefined ? null : (
          <Link to="/runs/$runId" params={{ runId: visit.childRunId }} className="o-row__meta">
            {t('workflows.runs.child')}
          </Link>
        )}
      </span>
      <span className="o-row__end">
        <Badge tone="neutral">{enumText('workflows.kind', visit.kind)}</Badge>{' '}
        <time dateTime={visit.startedAt}>{formatAbsolute(visit.startedAt, i18n.language)}</time>
      </span>
    </div>
  );
}
