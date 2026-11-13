// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Facts, Section } from '@/shared/ui/Screen';
import type { TeamCodeImportViewModel } from '../useImport';

/** The file `ostrom import teamcode` read from TeamCode: chosen here, summed up in counts, never shown. */
export function ExportFile({ view }: { readonly view: TeamCodeImportViewModel }): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const file = view.file;
  return (
    <Section label={t('imports.file.title')}>
      <div className="o-stack">
        <p className="o-screen__lead">
          {t('imports.file.lead')} <span className="o-mono">ostrom import teamcode</span>
        </p>
        <label htmlFor={id} className="o-field-label">
          {t('imports.file.choose')}
        </label>
        <input
          id={id}
          className="o-input"
          type="file"
          accept=".json,application/json"
          // A run on its way keeps its file: its report and the screens it refreshes are not dropped.
          disabled={view.running !== undefined}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen !== undefined) view.choose(chosen);
            // The same file can be chosen again after it was forgotten.
            event.target.value = '';
          }}
        />
        {view.fileProblem === undefined ? null : (
          <Banner tone="warning" tag={t('imports.file.problemTag')} live>
            {t(`imports.file.problem.${view.fileProblem}`)}
          </Banner>
        )}
        {file === undefined ? null : (
          <>
            <Facts
              facts={[
                { label: t('imports.file.name'), value: file.name, mono: true },
                { label: t('imports.file.members'), value: String(file.summary.members) },
                { label: t('imports.file.servers'), value: String(file.summary.servers) },
                { label: t('imports.file.assignments'), value: String(file.summary.assignments) },
                { label: t('imports.file.accounts'), value: String(file.summary.accounts) },
              ]}
            />
            {file.summary.unmapped.length === 0 ? null : (
              <Banner tone="warning" tag={t('imports.file.unmappedTag')}>
                {t('imports.file.unmapped', {
                  count: file.summary.unmapped.length,
                  list: file.summary.unmapped.join(', '),
                })}
              </Banner>
            )}
            <p className="o-screen__lead">{t('imports.file.inClear')}</p>
            <div className="o-inline">
              <Button variant="ghost" disabled={view.running !== undefined} onClick={view.forget}>
                {t('imports.file.forget')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
