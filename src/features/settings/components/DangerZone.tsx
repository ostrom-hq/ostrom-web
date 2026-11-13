// SPDX-License-Identifier: Apache-2.0
import type { OrgView } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { deletionConfirmed } from '../model';
import type { DeleteOrgViewModel } from '../useSettings';

export interface DangerZoneProps {
  readonly org: OrgView;
  /** Only the owner deletes the organization. */
  readonly isOwner: boolean;
  readonly deletion: DeleteOrgViewModel;
}

/** Deleting the organization, away from the rest: its short name typed again, then one button that says it all. */
export function DangerZone({ org, isOwner, deletion }: DangerZoneProps): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const confirmId = useId();
  const confirmed = deletionConfirmed(typed, org.slug);
  return (
    <section className="o-card o-section st-danger" aria-label={t('settings.danger.title')}>
      <h2 className="o-label">{t('settings.danger.title')}</h2>
      <p>{t('settings.danger.what', { name: org.name })}</p>
      {isOwner ? (
        <form
          className="o-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) deletion.remove(typed);
          }}
        >
          <label htmlFor={confirmId} className="o-field-label">
            {t('settings.danger.type', { slug: org.slug })}
          </label>
          <input
            id={confirmId}
            className="o-input o-mono"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <span className="o-self-start">
            <Button type="submit" variant="danger" disabled={!confirmed || deletion.deleting}>
              {deletion.deleting
                ? t('settings.danger.deleting')
                : t('settings.danger.delete', { name: org.name })}
            </Button>
          </span>
        </form>
      ) : (
        <p className="o-row__meta">{t('settings.danger.ownerOnly')}</p>
      )}
      {deletion.stepUp ? (
        <Banner tone="warning" tag={t('settings.danger.stepUpTag')} live>
          {t('settings.danger.stepUp')}{' '}
          <Link to="/signin" search={{ redirect: '/settings' }}>
            {t('settings.security.signInAgain')}
          </Link>
        </Banner>
      ) : null}
      {deletion.failure === undefined ? null : (
        <Banner tone="danger" tag={t('settings.danger.errorTag')} live>
          {deletion.failure.message}
        </Banner>
      )}
    </section>
  );
}
