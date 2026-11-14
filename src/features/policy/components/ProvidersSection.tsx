// SPDX-License-Identifier: Apache-2.0
import type { InferenceSettings } from '@gen/api/types.gen';
import { type ReactElement, useId, useRef, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import { type Provider, PROVIDERS, providersDraftOf, type ProvidersDraft, settingsOf } from '../model';
import type { ProvidersViewModel } from '../usePolicy';
import { FailureText } from '@/shared/ui/FailureText';

function ProvidersForm({
  settings,
  secrets,
  view,
}: {
  readonly settings: InferenceSettings;
  readonly secrets: readonly string[] | undefined;
  readonly view: ProvidersViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraftState] = useState<ProvidersDraft>(() => providersDraftOf(settings));
  // What is on screen, read when a save answers.
  const current = useRef(draft);
  // An edit after a save is not saved yet: its banner goes. A save still going keeps its answer coming.
  const setDraft = (next: ProvidersDraft): void => {
    if (!view.change.saving) view.change.reset();
    current.current = next;
    setDraftState(next);
  };
  const listId = useId();
  const ids: Record<Provider, string> = { anthropic: useId(), openai: useId(), openrouter: useId() };
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const sent = draft;
        // Typed while the save went: what is on screen is not what was saved, so "saved" is not said.
        view.change.save(settingsOf(sent, settings), () => {
          if (current.current !== sent) view.change.reset();
        });
      }}
    >
      <datalist id={listId}>
        {(secrets ?? []).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {PROVIDERS.map((provider) => (
        <span key={provider} className="o-stack">
          <label htmlFor={ids[provider]} className="o-field-label">
            {t(`policy.providers.${provider}`)}
          </label>
          <input
            id={ids[provider]}
            className="o-input o-mono"
            list={listId}
            placeholder={t('policy.providers.placeholder')}
            value={draft[provider]}
            onChange={(event) => {
              setDraft({ ...draft, [provider]: event.target.value });
            }}
          />
        </span>
      ))}
      {secrets?.length === 0 ? <p className="o-screen__lead">{t('policy.providers.noSecret')}</p> : null}
      <label className="pl-toggle">
        <input
          type="checkbox"
          checked={draft.shared}
          onChange={(event) => {
            setDraft({ ...draft, shared: event.target.checked });
          }}
        />
        <span>{t('policy.providers.shared')}</span>
      </label>
      <span className="o-self-start">
        <Button type="submit" disabled={view.change.saving}>
          {view.change.saving ? t('policy.saving') : t('policy.save')}
        </Button>
      </span>
    </form>
  );
}

export interface ProvidersSectionProps {
  readonly view: ProvidersViewModel;
  /** Owners and admins read and change the keys; nobody else sees them. */
  readonly canChange: boolean;
}

/** Which organization secret holds each provider's key, and whether members' shared accounts serve before them. */
export function ProvidersSection({ view, canChange }: ProvidersSectionProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Section label={t('policy.providers.title')}>
      <p className="o-screen__lead">{t('policy.providers.lead')}</p>
      {canChange ? (
        <>
          {view.change.failure === undefined ? null : (
            <Banner tone="danger" tag={t('policy.errorTag')} live>
              <FailureText failure={view.change.failure} />
            </Banner>
          )}
          {view.change.saved ? (
            <Banner tag={t('policy.savedTag')} live>
              {t('policy.providers.saved')}
            </Banner>
          ) : null}
          <LoadState data={view.settings} failure={view.failure}>
            {(settings) => <ProvidersForm settings={settings} secrets={view.secrets} view={view} />}
          </LoadState>
        </>
      ) : (
        <p className="o-screen__lead">{t('policy.providers.adminsOnly')}</p>
      )}
    </Section>
  );
}
