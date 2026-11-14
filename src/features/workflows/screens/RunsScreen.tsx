// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { useViewer } from '@/shared/auth/useViewer';
import { useFeature } from '@/shared/capabilities';
import { Screen } from '@/shared/ui/Screen';
import { RunList } from '../components/RunList';
import { RUN_STATUSES } from '../runs';
import { NO_FILTERS, type RunFilters, useOrgRuns } from '../useRuns';
import { useWorkflows } from '../useWorkflows';

/** Every run of the organization's workflows, newest first, as `/sessions` lists the sessions. */
export function RunsScreen(): ReactElement {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<RunFilters>(NO_FILTERS);
  const list = useOrgRuns(filters);
  return (
    <Screen title={t('workflows.runs.title')} lead={t('workflows.runs.allLead')}>
      <Filters filters={filters} onChange={setFilters} />
      <RunList list={list} withWorkflow />
    </Screen>
  );
}

/** What narrows the list: one workflow, one status, and for an administrator every member's runs. */
function Filters({
  filters,
  onChange,
}: {
  readonly filters: RunFilters;
  readonly onChange: (next: RunFilters) => void;
}): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  const ids = { workflow: useId(), status: useId() };
  const { workflows } = useWorkflows();
  const viewer = useViewer();
  // Every member's runs, and the workflow filter, are served with the workflow delivery.
  const served = useFeature('workflows.deliver.v1');
  return (
    <form
      className="o-inline"
      aria-label={t('workflows.runs.filters.label')}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {viewer.canManage && served ? (
        <label className="o-inline">
          <input
            type="checkbox"
            checked={filters.all}
            onChange={(event) => {
              onChange({ ...filters, all: event.target.checked });
            }}
          />
          <span>{t('workflows.runs.filters.all')}</span>
        </label>
      ) : null}
      {served ? (
        <span className="o-stack">
          <label htmlFor={ids.workflow} className="o-field-label">
            {t('workflows.runs.filters.workflow')}
          </label>
          <select
            id={ids.workflow}
            className="o-input o-select"
            value={filters.workflow}
            onChange={(event) => {
              onChange({ ...filters, workflow: event.target.value });
            }}
          >
            <option value="">{t('workflows.runs.filters.anyWorkflow')}</option>
            {(workflows ?? []).map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      <span className="o-stack">
        <label htmlFor={ids.status} className="o-field-label">
          {t('workflows.runs.filters.status')}
        </label>
        <select
          id={ids.status}
          className="o-input o-select"
          value={filters.status}
          onChange={(event) => {
            onChange({ ...filters, status: event.target.value });
          }}
        >
          <option value="">{t('workflows.runs.filters.anyStatus')}</option>
          {RUN_STATUSES.map((status) => (
            <option key={status} value={status}>
              {enumText('workflows.runs.status', status)}
            </option>
          ))}
        </select>
      </span>
    </form>
  );
}
