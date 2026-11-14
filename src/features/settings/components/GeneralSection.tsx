// SPDX-License-Identifier: Apache-2.0
import type { OrgView } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Facts, Section } from '@/shared/ui/Screen';
import { MAX_ORG_NAME } from '@/shared/org/slug';
import { browserTimeZone, renameProblem } from '../model';
import type { RenameViewModel } from '../useSettings';

export interface GeneralSectionProps {
  readonly org: OrgView;
  /** Owners and admins rename it; everyone else reads it. */
  readonly canRename: boolean;
  readonly rename: RenameViewModel;
}

/** The organization's name, its short name and the time zone the console shows times in. */
export function GeneralSection({ org, canRename, rename }: GeneralSectionProps): ReactElement {
  const { t } = useTranslation();
  // What was typed, or nothing: an untouched field shows the server's name. A name changed on the server (here, in
  // another tab, by another admin) starts the field again from it, so a save never reverts someone else's rename.
  const [edit, setEdit] = useState<string | undefined>(undefined);
  const [seen, setSeen] = useState(org.name);
  if (seen !== org.name) {
    setSeen(org.name);
    setEdit(undefined);
  }
  const typed = edit ?? org.name;
  const nameId = useId();
  const problem = renameProblem(typed, org.name);
  return (
    <Section label={t('settings.general.title')}>
      {canRename ? (
        <form
          className="o-stack"
          onSubmit={(event) => {
            event.preventDefault();
            rename.rename(typed, () => {
              setEdit(undefined);
            });
          }}
        >
          <label htmlFor={nameId} className="o-field-label">
            {t('settings.general.name')}
          </label>
          <span className="o-inline">
            <input
              id={nameId}
              className="o-input st-name"
              maxLength={MAX_ORG_NAME}
              value={typed}
              readOnly={rename.saving}
              onChange={(event) => {
                setEdit(event.target.value);
                rename.edited();
              }}
            />
            <Button type="submit" disabled={rename.saving || problem !== undefined}>
              {rename.saving ? t('settings.general.saving') : t('settings.general.save')}
            </Button>
          </span>
          {problem !== undefined && problem !== 'same' ? (
            <p className="o-row__meta">{t(`settings.general.problem.${problem}`)}</p>
          ) : null}
        </form>
      ) : null}
      <Facts
        facts={[
          canRename ? undefined : { label: t('settings.general.name'), value: org.name },
          { label: t('settings.general.slug'), value: org.slug, mono: true },
          {
            label: t('settings.general.timeZone'),
            value: t('settings.general.zone', { zone: browserTimeZone() }),
          },
        ]}
      />
      <p className="o-row__meta">{t('settings.general.slugNote')}</p>
      {rename.saved === org.name ? (
        <Banner tone="info" tag={t('settings.general.savedTag')} live>
          {t('settings.general.saved', { name: org.name })}
        </Banner>
      ) : null}
      {rename.failure === undefined ? null : (
        <Banner tone="danger" tag={t('settings.general.errorTag')} live>
          {rename.failure.message}
        </Banner>
      )}
    </Section>
  );
}
