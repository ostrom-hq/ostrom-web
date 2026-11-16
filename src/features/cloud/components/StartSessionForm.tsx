// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useAnnounced, useFeature } from '@/shared/capabilities';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import {
  conversesHeadless,
  imageAllowed,
  isPromptAgent,
  isSessionMode,
  PROMPT_AGENTS,
  type PromptAgent,
  SESSION_MODES,
  type SessionMode,
} from '../model';
import { checkRecipe, EMPTY_RECIPE, type RecipeDraft } from '../recipe';
import { SESSION_TARGETS, type SessionTarget } from '../remote';
import { type SessionChangeViewModel, useStartProfiles } from '../useCloud';
import { useDeviceStart } from '../useDeviceStart';
import { DeviceStartForm } from './DeviceStartForm';
import { RecipeFields } from './RecipeFields';

/**
 * Start an agent: on one of the organization's runners, or, where the server starts sessions on the member's devices
 * (`runners.cloud.remote.daemon.v1`), in a folder of one of their online devices (TeamCode's companion "New session").
 */
export function StartSessionForm({ change }: { readonly change: SessionChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const onDevices = useAnnounced('runners.cloud.remote.daemon.v1');
  const [target, setTarget] = useState<SessionTarget>('cloud');
  const device = useDeviceStart(change);
  return (
    <Section label={t('cloud.start.title')}>
      {onDevices ? (
        <div className="o-inline cl-filters" role="group" aria-label={t('cloud.remote.start.target.label')}>
          {SESSION_TARGETS.map((option) => (
            <Button
              key={option}
              variant="ghost"
              aria-pressed={target === option}
              onClick={() => {
                setTarget(option);
                // Read again at each switch: a device listed earlier may have gone offline since.
                if (option === 'device') device.loadDevices();
              }}
            >
              {t(`cloud.remote.start.target.${option}`)}
            </Button>
          ))}
        </div>
      ) : null}
      {onDevices && target === 'device' ? <DeviceStartForm view={device} /> : null}
      {/* Hidden, not unmounted, while the device form shows: what was typed in it is still there on the way back. */}
      <div hidden={onDevices && target === 'device'}>
        <CloudStartForm change={change} />
      </div>
    </Section>
  );
}

/** An agent on one of the organization's runners: what to do, where, and a name to find it again. */
function CloudStartForm({ change }: { readonly change: SessionChangeViewModel }): ReactElement {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<PromptAgent>('claude');
  const [prompt, setPrompt] = useState('');
  const [repo, setRepo] = useState('');
  const [name, setName] = useState('');
  const [recipe, setRecipe] = useState<RecipeDraft>(EMPTY_RECIPE);
  const [picked, setPicked] = useState('');
  const [image, setImage] = useState('');
  const [mode, setMode] = useState<SessionMode>('terminal');
  // A conversation only where the server has one, and for the agents that run headless; otherwise a terminal, unsent.
  const conversations = useAnnounced('runners.cloud.conversation.v1') && conversesHeadless(agent);
  const sentMode = conversations && mode === 'conversation' ? mode : undefined;
  const start = useStartProfiles();
  const profiles = start.profiles ?? [];
  // The only profile there is is the one to run on; with several, the person chooses.
  const profile =
    profiles.find((item) => item.id === picked) ?? (profiles.length === 1 ? profiles[0] : undefined);
  const overrides = profile?.spec.allowedImageOverrides ?? [];
  const imageProblem = profile !== undefined && !imageAllowed(image, profile);
  // Profiles that could not be read do not stop a start: the server picks the owner's only profile, or says which one.
  const profileBlocks =
    start.enabled &&
    start.failure === undefined &&
    (start.profiles === undefined || profile === undefined || imageProblem);
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
    mode: useId(),
  };
  return (
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
            ...(sentMode === undefined ? {} : { mode: sentMode }),
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
        {conversations ? (
          <>
            <label htmlFor={ids.mode} className="o-field-label">
              {t('cloud.start.mode')}
            </label>
            <select
              id={ids.mode}
              className="o-input o-select"
              value={mode}
              onChange={(event) => {
                if (isSessionMode(event.target.value)) setMode(event.target.value);
              }}
            >
              {SESSION_MODES.map((option) => (
                <option key={option} value={option}>
                  {t(`cloud.start.modes.${option}`)}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <Button
          type="submit"
          disabled={change.starting || prompt.trim() === '' || problem !== undefined || profileBlocks}
        >
          {change.starting ? t('cloud.start.starting') : t('cloud.start.submit')}
        </Button>
      </div>
    </form>
  );
}
