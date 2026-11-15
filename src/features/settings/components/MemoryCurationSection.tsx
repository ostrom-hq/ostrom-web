// SPDX-License-Identifier: Apache-2.0
import type { MemoryCuration } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Section } from '@/shared/ui/Screen';
import { useMemoryCuration } from '../useMemoryCuration';

/**
 * Whether the organization's memory is curated: about once an hour the server supersedes the older of two entries with
 * the same title and text and queues the pairs it cannot decide for a person. Owners and admins only, and only where
 * the server serves the memory (`memory.v1`): nothing is asked of any other, and nobody else sees the section.
 */
export function MemoryCurationSection({ manages }: { readonly manages: boolean }): ReactElement | null {
  const { t } = useTranslation();
  const served = useAnnounced('memory.v1');
  const shown = served && manages;
  const view = useMemoryCuration(shown);
  if (!shown) return null;
  return (
    <Section label={t('settings.memoryCuration.title')}>
      <p className="o-row__meta">{t('settings.memoryCuration.lead')}</p>
      <LoadState data={view.curation} failure={view.failure} rows={1}>
        {(curation) => (
          <>
            <label className="o-inline">
              <input
                type="checkbox"
                role="switch"
                checked={curation.enabled}
                disabled={view.saving}
                onChange={(event) => {
                  view.save(event.target.checked);
                }}
              />
              <span>{t('settings.memoryCuration.switch')}</span>
            </label>
            <LastRun curation={curation} />
            {view.saveFailure === undefined ? null : (
              <Banner tone="danger" tag={t('settings.memoryCuration.errorTag')} live>
                {view.saveFailure.message}
              </Banner>
            )}
          </>
        )}
      </LoadState>
    </Section>
  );
}

function LastRun({ curation }: { readonly curation: MemoryCuration }): ReactElement {
  const { t, i18n } = useTranslation();
  const lastRunAt = curation.lastRunAt ?? undefined;
  if (lastRunAt === undefined) {
    return <p className="o-row__meta">{t('settings.memoryCuration.neverRun')}</p>;
  }
  return (
    <p className="o-row__meta">
      {t('settings.memoryCuration.lastRun', {
        when: formatAbsolute(lastRunAt, i18n.language),
        superseded: curation.lastSuperseded ?? 0,
        queued: curation.lastQueued ?? 0,
      })}
    </p>
  );
}
