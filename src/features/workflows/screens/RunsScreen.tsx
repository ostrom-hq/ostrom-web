// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/shared/ui/Screen';
import { RunList } from '../components/RunList';
import { useOrgRuns } from '../useRuns';

/** Every run of the organization's workflows, newest first, as `/sessions` lists the sessions. */
export function RunsScreen(): ReactElement {
  const { t } = useTranslation();
  const list = useOrgRuns();
  return (
    <Screen title={t('workflows.runs.title')} lead={t('workflows.runs.allLead')}>
      <RunList list={list} withWorkflow />
    </Screen>
  );
}
