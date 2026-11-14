// SPDX-License-Identifier: Apache-2.0
import type { InstanceSettings } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { EmptyState, LoadState } from '@/shared/ui/Screen';
import { AdminFrame } from '../components/AdminFrame';
import { SectionForm } from '../components/SectionForm';
import { useInstanceSettings, useSaveInstanceSettings } from '../useAdmin';

/** Admin, Settings: one form per section, generated from the fields the server lists for it. */
export function InstanceSettingsScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <AdminFrame title={t('admin.settings.title')} lead={t('admin.settings.lead')}>
      <Sections />
    </AdminFrame>
  );
}

/** Only mounted for an administrator of the instance: nothing is asked of the server before. */
function Sections(): ReactElement {
  const { t } = useTranslation();
  const { sections, failure, reload } = useInstanceSettings();
  return (
    <LoadState data={sections} failure={failure} rows={4}>
      {(list) =>
        list.length === 0 ? (
          <EmptyState title={t('admin.settings.empty')}>{t('admin.settings.emptyBody')}</EmptyState>
        ) : (
          <div className="o-stack">
            {list.map((settings) => (
              <SectionOf key={settings.section} settings={settings} onReload={reload} />
            ))}
          </div>
        )
      }
    </LoadState>
  );
}

/** One section with its own save: a failure or a save in one never touches another. */
function SectionOf({
  settings,
  onReload,
}: {
  readonly settings: InstanceSettings;
  readonly onReload: () => Promise<void>;
}): ReactElement {
  const save = useSaveInstanceSettings();
  return (
    <SectionForm
      settings={settings}
      save={save}
      onReload={() => {
        void onReload();
      }}
    />
  );
}
