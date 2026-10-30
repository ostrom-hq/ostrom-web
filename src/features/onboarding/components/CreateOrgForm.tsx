// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nameProblem, slugOf, slugProblem } from '@/shared/org/slug';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { CreateOrgViewModel } from '../useOnboarding';

/**
 * The organization's name, and its short name: derived from the name as the server derives it, or chosen. Only a
 * chosen one can be taken; a derived one the server numbers (`acme-2`).
 */
export function CreateOrgForm({ org }: { readonly org: CreateOrgViewModel }): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const nameId = useId();
  const slugId = useId();
  const hintId = useId();
  const nameIssue = name === '' ? undefined : nameProblem(name);
  const slugIssue = slug === undefined ? undefined : slugProblem(slug);
  const shown = slug ?? slugOf(name);
  const ready = nameProblem(name) === undefined && slugIssue === undefined && !org.creating;
  return (
    <form
      className="o-card o-section o-stack"
      aria-label={t('onboarding.create.title')}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) org.create(name, slug);
      }}
    >
      <label htmlFor={nameId} className="o-field-label">
        {t('onboarding.create.name')}
      </label>
      <input
        id={nameId}
        className="o-input"
        autoComplete="organization"
        placeholder={t('onboarding.create.namePlaceholder')}
        value={name}
        aria-invalid={nameIssue !== undefined}
        aria-describedby={slug === undefined && name.trim() !== '' ? hintId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          org.edited();
        }}
      />
      {nameIssue === undefined ? null : (
        <Banner tone="warning" tag={t('onboarding.create.checkTag')}>
          {t(`onboarding.create.nameProblem.${nameIssue}`)}
        </Banner>
      )}
      {slug === undefined ? (
        name.trim() === '' ? null : (
          <p className="o-row__meta" id={hintId}>
            {t('onboarding.create.slugDerived', { slug: shown })}{' '}
            <button
              type="button"
              className="o-linkbtn"
              onClick={() => {
                setSlug(shown);
              }}
            >
              {t('onboarding.create.slugChoose')}
            </button>
          </p>
        )
      ) : (
        <>
          <label htmlFor={slugId} className="o-field-label">
            {t('onboarding.create.slug')}
          </label>
          <input
            id={slugId}
            className="o-input o-mono"
            value={slug}
            spellCheck={false}
            aria-invalid={slugIssue !== undefined || org.slugTaken}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase());
              org.edited();
            }}
          />
          {slugIssue === undefined ? null : (
            <Banner tone="warning" tag={t('onboarding.create.checkTag')}>
              {t(`onboarding.create.slugProblem.${slugIssue}`)}
            </Banner>
          )}
        </>
      )}
      {org.slugTaken ? (
        <Banner tone="danger" tag={t('onboarding.create.failedTag')} live>
          {t('onboarding.create.slugTaken')}
        </Banner>
      ) : null}
      {org.failure === undefined ? null : (
        <Banner tone="danger" tag={t('onboarding.create.failedTag')} live>
          {org.failure.message}
        </Banner>
      )}
      <div>
        <Button type="submit" disabled={!ready}>
          {org.creating ? t('onboarding.create.creating') : t('onboarding.create.go')}
        </Button>
      </div>
    </form>
  );
}
