// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { usePacingSettings } from '../usePoolSize';

/**
 * TeamCode's controller settings: observation only, and the automatic pool size (`PUT /api/v1/policy/pacing`). A field
 * left as it is stays out of the write, so a change here never rewrites the other setting.
 */
export function SettingsSection(): ReactElement | null {
  const { t } = useTranslation();
  const served = useAnnounced('capacity.pacing.v1');
  const view = usePacingSettings(served);
  const [auto, setAuto] = useState<boolean | undefined>(undefined);
  const [observation, setObservation] = useState<boolean | undefined>(undefined);
  const autoId = useId();
  const observationId = useId();
  if (!served) return null;
  return (
    <Section label={t('poolSize.settings.title')}>
      <LoadState data={view.settings} failure={view.failure} rows={2}>
        {(settings) => {
          const autoNow = auto ?? settings.autoPoolSize === true;
          const observationNow = observation ?? settings.observationOnly === true;
          const changed =
            autoNow !== (settings.autoPoolSize === true) ||
            observationNow !== (settings.observationOnly === true);
          return (
            <form
              className="o-stack"
              onSubmit={(event) => {
                event.preventDefault();
                view.save(
                  {
                    ...(autoNow === (settings.autoPoolSize === true) ? {} : { autoPoolSize: autoNow }),
                    ...(observationNow === (settings.observationOnly === true)
                      ? {}
                      : { observationOnly: observationNow }),
                  },
                  () => {
                    setAuto(undefined);
                    setObservation(undefined);
                  },
                );
              }}
            >
              <div className="o-stack">
                <label htmlFor={autoId} className="ps-toggle">
                  <input
                    id={autoId}
                    type="checkbox"
                    checked={autoNow}
                    onChange={(event) => {
                      setAuto(event.target.checked);
                    }}
                  />
                  <span>{t('poolSize.settings.autoPoolSize')}</span>
                </label>
                <p className="o-row__meta">{t('poolSize.settings.autoPoolSizeHelp')}</p>
              </div>
              <div className="o-stack">
                <label htmlFor={observationId} className="ps-toggle">
                  <input
                    id={observationId}
                    type="checkbox"
                    checked={observationNow}
                    onChange={(event) => {
                      setObservation(event.target.checked);
                    }}
                  />
                  <span>{t('poolSize.settings.observationOnly')}</span>
                </label>
                <p className="o-row__meta">{t('poolSize.settings.observationOnlyHelp')}</p>
              </div>
              {view.saveFailure === undefined ? null : (
                <Banner tone="danger" tag={t('poolSize.settings.errorTag')} live>
                  <FailureText failure={view.saveFailure} />
                </Banner>
              )}
              <span className="o-self-start">
                <Button type="submit" disabled={!changed || view.saving}>
                  {view.saving ? t('poolSize.settings.saving') : t('poolSize.settings.save')}
                </Button>
              </span>
            </form>
          );
        }}
      </LoadState>
    </Section>
  );
}
