// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeature } from '@/shared/capabilities';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { imageAllowed, isPromptAgent, PROMPT_AGENTS, type PromptAgent } from '../model';
import { checkRecipe, EMPTY_RECIPE, type RecipeDraft } from '../recipe';
import { type SessionChangeViewModel, useStartProfiles } from '../useCloud';
import { RecipeFields } from './RecipeFields';

/** An agent on one of the organization's runners: what to do, where, and a name to find it again. */
export function StartSessionForm({ change }: { readonly change: SessionChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<PromptAgent>('claude');
  const [prompt, setPrompt] = useState('');
  const [repo, setRepo] = useState('');
  const [name, setName] = useState('');
  const [recipe, setRecipe] = useState<RecipeDraft>(EMPTY_RECIPE);
  const [picked, setPicked] = useState('');
  const [image, setImage] = useState('');
  const start = useStartProfiles();
  const profiles = start.profiles ?? [];
  // The only profile there is is the one to run on; with several, the person chooses.
  const profile =
    profiles.find((item) => item.id === picked) ?? (profiles.length === 1 ? profiles[0] : undefined);
  const overrides = profile?.spec.allowedImageOverrides ?? [];
  const imageProblem = profile !== undefined && !imageAllowed(image, profile);
  const profileBlocks =
    start.enabled && (start.profiles === undefined || profile === undefined || imageProblem);
  // A server without the recipe is never sent one: the older single repository stays the way to clone.
  const recipes = useFeature('runners.cloud.environment.v1');
  const checked = recipes ? checkRecipe(recipe, repo) : { environment: undefined };
  const problem = 'problem' in checked ? checked.problem : undefined;
  const ids = {
    agent: useId(),
    prompt: useId(),
    repo: useId(),
    name: useId(),
    profile: useId(),
    image: useId(),
  };
  return (
    <Section label={t('cloud.start.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if ('problem' in checked) return;
          if (profileBlocks) return;
          change.start(
            {
              agent,
              prompt,
              name,
              repo,
              environment: checked.environment,
              ...(profile === undefined ? {} : { profileId: profile.id, image }),
            },
            () => {
              setPrompt('');
              setRepo('');
              setName('');
              setRecipe(EMPTY_RECIPE);
              setImage('');
            },
          );
        }}
      >
        <label htmlFor={ids.prompt} className="o-field-label">
          {t('cloud.start.prompt')}
        </label>
        <textarea
          id={ids.prompt}
          className="o-input"
          rows={3}
          placeholder={t('cloud.start.promptHint')}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
        <div className="o-inline">
          <label htmlFor={ids.repo} className="o-field-label">
            {t('cloud.start.repo')}
          </label>
          <input
            id={ids.repo}
            className="o-input o-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder="acme/web"
            value={repo}
            onChange={(event) => {
              setRepo(event.target.value);
            }}
          />
          <label htmlFor={ids.name} className="o-field-label">
            {t('cloud.start.name')}
          </label>
          <input
            id={ids.name}
            className="o-input"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        {!start.enabled ? null : start.profiles === undefined ? (
          <p className="o-row__meta">
            {start.failure === undefined ? t('cloud.start.profilesLoading') : start.failure.message}
          </p>
        ) : profiles.length === 0 ? (
          <p className="o-row__meta" role="status">
            {t('cloud.start.noProfile')}
          </p>
        ) : (
          <div className="o-stack">
            <label htmlFor={ids.profile} className="o-field-label">
              {t('cloud.start.profile')}
            </label>
            <select
              id={ids.profile}
              className="o-input o-select"
              value={profile?.id ?? ''}
              onChange={(event) => {
                setPicked(event.target.value);
              }}
            >
              {profiles.length === 1 ? null : <option value="">{t('cloud.start.pickProfile')}</option>}
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {profile === undefined ? null : (
              <>
                <label htmlFor={ids.image} className="o-field-label">
                  {t('cloud.start.image')}
                </label>
                <input
                  id={ids.image}
                  className="o-input o-mono"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={profile.spec.image}
                  value={image}
                  onChange={(event) => {
                    setImage(event.target.value);
                  }}
                />
                <p className="o-row__meta">
                  {overrides.length === 0
                    ? t('cloud.start.imageNone')
                    : t('cloud.start.imageAllowed', { list: overrides.join(', ') })}
                </p>
                {imageProblem ? (
                  <p className="cl-recipe__problem" role="alert">
                    {t('cloud.start.imageNotAllowed')}
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}
        {recipes ? <RecipeFields draft={recipe} onChange={setRecipe} /> : null}
        {problem === undefined ? null : (
          // Beside the button it holds, even with the recipe folded: the older Repository field alone can cause it.
          <p className="cl-recipe__problem" role="alert">
            {t(`cloud.recipe.problem.${problem}`)}
          </p>
        )}
        <div className="o-inline">
          <label htmlFor={ids.agent} className="o-field-label">
            {t('cloud.start.agent')}
          </label>
          <select
            id={ids.agent}
            className="o-input o-select"
            value={agent}
            onChange={(event) => {
              if (isPromptAgent(event.target.value)) setAgent(event.target.value);
            }}
          >
            {PROMPT_AGENTS.map((option) => (
              <option key={option} value={option}>
                {t(`cloud.agent.${option}`)}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            disabled={change.starting || prompt.trim() === '' || problem !== undefined || profileBlocks}
          >
            {change.starting ? t('cloud.start.starting') : t('cloud.start.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
