// SPDX-License-Identifier: Apache-2.0
import type { ImportItem, ImportReport } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { knownOr, type Known } from '@/shared/lib/openEnum';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { countsOf, type ImportMode, REPORT_ACTIONS } from '../model';

/** Green for what was written, amber for what waits or was left out; garnet stays for the yes. */
const ACTION_TONE: Readonly<Record<Known<ImportItem['action']>, BadgeTone>> = {
  planned: 'neutral',
  created: 'success',
  updated: 'success',
  unchanged: 'neutral',
  skipped: 'warning',
  revive_at_cutover: 'warning',
};

export interface ImportReportViewProps {
  readonly mode: ImportMode;
  readonly report: ImportReport;
}

/** A run's report: how many lines of each action, then each line, in the order the server applied them. */
export function ImportReportView({ mode, report }: ImportReportViewProps): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  const counts = countsOf(report);
  const shown = REPORT_ACTIONS.filter((action) => counts[action] > 0);
  return (
    <div className="o-stack">
      {shown.length === 0 ? (
        <p className="o-screen__lead">{t('imports.report.empty')}</p>
      ) : (
        <ul className="o-inline im-counts" aria-label={t(`imports.report.counts.${mode}`)}>
          {shown.map((action) => (
            <li key={action}>
              <Badge tone={ACTION_TONE[action]}>
                {t(`imports.report.count.${action}`, { count: counts[action] })}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {report.items.length === 0 ? null : (
        <ul className="o-rows" aria-label={t(`imports.report.lines.${mode}`)}>
          {report.items.map((item, index) => (
            // The same name can come twice (a server and its secret): the place in the report tells them apart.
            <li key={`${item.kind}-${item.name}-${String(index)}`} className="o-row">
              <span className="o-row__main">
                <span className="o-row__title o-mono">{item.name}</span>
                <span className="o-row__meta">
                  {item.reason === undefined
                    ? enumText('imports.kind', item.kind)
                    : `${enumText('imports.kind', item.kind)} · ${item.reason}`}
                </span>
              </span>
              <span className="o-row__end">
                <Badge tone={knownOr(ACTION_TONE, item.action, 'neutral')}>
                  {enumText('imports.action', item.action)}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
