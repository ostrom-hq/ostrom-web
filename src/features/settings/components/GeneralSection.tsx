// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgView } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Facts, Section } from '@/shared/ui/Screen';
import { browserTimeZone, ORG_NAME_MAX, renameProblem } from '../model';
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
  const [typed, setTyped] = useState(org.name);
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
              setTyped(typed.trim());
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
              maxLength={ORG_NAME_MAX}
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
            <Button type="submit" disabled={rename.saving || problem !== undefined}>
              {rename.saving ? t('settings.general.saving') : t('settings.general.save')}
            </Button>
          </span>
          {problem === 'empty' ? <p className="o-row__meta">{t('settings.general.empty')}</p> : null}
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
      {rename.saved && problem === 'same' ? (
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
