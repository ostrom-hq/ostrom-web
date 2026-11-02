// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { EmptyState, Screen, Section } from '@/shared/ui/Screen';
import { ExportFile } from '../components/ExportFile';
import { ImportReportView } from '../components/ImportReportView';
import { changesOf, type ImportMode } from '../model';
import { useTeamCodeImport } from '../useImport';
import './import.css';

/** Moving a TeamCode team into the organization: the plan, the real import, then the cutover once TeamCode stops. */
export function ImportScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('imports.title')}>
      {(org, role) => <ImportSteps orgName={org.name} role={role} />}
    </WithOrg>
  );
}

function ImportSteps({
  orgName,
  role,
}: {
  readonly orgName: string;
  readonly role: OrgRole | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const view = useTeamCodeImport();
  if (!managesMembers(role))
    return (
      <Screen title={t('imports.title')}>
        <EmptyState title={t('imports.forbiddenTitle')}>{t('imports.forbidden')}</EmptyState>
      </Screen>
    );
  const { dryRun: plan, import: imported, cutover } = view.reports;
  const busy = view.running !== undefined;
  const failure = view.failure;
  const file = view.file;
  return (
    <Screen title={t('imports.title')} lead={t('imports.lead', { org: orgName })}>
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('imports.failure.tag')} live>
          {failure.kind === 'other' ? failure.message : t(`imports.failure.${failure.kind}`)}
        </Banner>
      )}
      <ExportFile view={view} />
      {file === undefined ? null : (
        <>
          <Section label={t('imports.plan.title')}>
            <div className="o-stack">
              <p className="o-screen__lead">{t('imports.plan.lead')}</p>
              <div className="o-inline">
                <Button
                  disabled={busy}
                  onClick={() => {
                    file.run('dryRun');
                  }}
                >
                  {view.running === 'dryRun' ? t('imports.plan.running') : t('imports.plan.run')}
                </Button>
              </div>
              {plan === undefined ? null : <ImportReportView mode="dryRun" report={plan} />}
            </div>
          </Section>
          <Section label={t('imports.run.title')}>
            <div className="o-stack">
              <p className="o-screen__lead">{t('imports.run.lead')}</p>
              {plan === undefined ? (
                <p className="o-screen__lead">{t('imports.run.needsPlan')}</p>
              ) : (
                <div className="o-inline">
                  <ConfirmButton
                    tone="secondary"
                    label={view.running === 'import' ? t('imports.run.running') : t('imports.run.ask')}
                    confirm={t('imports.run.confirm', { count: changesOf(plan), org: orgName })}
                    keep={t('imports.keep')}
                    disabled={busy}
                    onConfirm={() => {
                      file.run('import');
                    }}
                  />
                </div>
              )}
              {imported === undefined ? null : <ImportReportView mode="import" report={imported} />}
            </div>
          </Section>
          <Section label={t('imports.cutover.title')}>
            <div className="o-stack">
              <p className="o-screen__lead">{t('imports.cutover.lead')}</p>
              {role !== 'owner' ? (
                <p className="o-screen__lead">{t('imports.cutover.ownersOnly')}</p>
              ) : imported === undefined ? (
                <p className="o-screen__lead">{t('imports.cutover.needsImport')}</p>
              ) : cutover === undefined ? (
                // A new file asks again whether TeamCode is stopped.
                <CutoverAsk
                  key={file.id}
                  orgName={orgName}
                  running={view.running}
                  onConfirm={() => {
                    file.run('cutover');
                  }}
                />
              ) : null}
              {cutover === undefined ? null : (
                <>
                  <Banner tag={t('imports.cutover.doneTag')}>{t('imports.cutover.done')}</Banner>
                  <ImportReportView mode="cutover" report={cutover} />
                </>
              )}
            </div>
          </Section>
        </>
      )}
    </Screen>
  );
}

/** Once run, the cutover is not offered again for this file: it rotates TeamCode's tokens. */
function CutoverAsk({
  orgName,
  running,
  onConfirm,
}: {
  readonly orgName: string;
  readonly running: ImportMode | undefined;
  readonly onConfirm: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [stopped, setStopped] = useState(false);
  const stoppedId = useId();
  return (
    <>
      <div className="o-inline">
        <input
          id={stoppedId}
          type="checkbox"
          checked={stopped}
          onChange={(event) => {
            setStopped(event.target.checked);
          }}
        />
        <label htmlFor={stoppedId}>{t('imports.cutover.stopped')}</label>
      </div>
      <div className="o-inline">
        <ConfirmButton
          label={running === 'cutover' ? t('imports.cutover.running') : t('imports.cutover.ask')}
          confirm={t('imports.cutover.confirm', { org: orgName })}
          keep={t('imports.keep')}
          disabled={running !== undefined || !stopped}
          onConfirm={onConfirm}
        />
      </div>
    </>
  );
}
