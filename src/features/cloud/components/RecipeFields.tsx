// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { EMPTY_REPOSITORY, MAX_REPOSITORIES, type RecipeDraft, type RepositoryDraft } from '../recipe';

export interface RecipeFieldsProps {
  readonly draft: RecipeDraft;
  readonly onChange: (draft: RecipeDraft) => void;
}

function RepositoryFields({
  index,
  repository,
  onChange,
  onRemove,
}: {
  readonly index: number;
  readonly repository: RepositoryDraft;
  readonly onChange: (repository: RepositoryDraft) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const field = (key: keyof RepositoryDraft, placeholder: string): ReactElement => (
    <span className="o-stack">
      <label htmlFor={`${id}-${key}`} className="o-field-label">
        {t(`cloud.recipe.repository.${key}`)}
      </label>
      <input
        id={`${id}-${key}`}
        className="o-input o-mono"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={repository[key]}
        onChange={(event) => {
          onChange({ ...repository, [key]: event.target.value });
        }}
      />
    </span>
  );
  return (
    <fieldset className="o-stack cl-variable">
      <legend className="o-field-label">{t('cloud.recipe.repository.title', { number: index + 1 })}</legend>
      <div className="cl-form__grid">
        {field('url', 'https://github.com/acme/web')}
        {field('path', 'web')}
        {field('ref', 'main')}
        {field('branch', 'agent/task')}
      </div>
      <Button variant="ghost" onClick={onRemove}>
        {t('cloud.recipe.repository.remove', { number: index + 1 })}
      </Button>
    </fieldset>
  );
}

/**
 * The preparation recipe of a session (`runners.cloud.environment.v1`): what the runner clones and runs before the agent
 * starts, the same at every resume. It holds no secret: variables are named, their values are the owner's.
 */
export function RecipeFields({ draft, onChange }: RecipeFieldsProps): ReactElement {
  const { t } = useTranslation();
  const ids = {
    workingDirectory: useId(),
    create: useId(),
    start: useId(),
    variables: useId(),
    github: useId(),
    domain: useId(),
  };
  const set = (change: Partial<RecipeDraft>): void => {
    onChange({ ...draft, ...change });
  };
  return (
    <details className="cl-recipe">
      <summary>{t('cloud.recipe.title')}</summary>
      <div className="o-stack">
        <p className="cl-recipe__lead">{t('cloud.recipe.lead')}</p>
        {draft.repositories.map((repository, index) => (
          <RepositoryFields
            // A row has no id of its own: its place is what the person sees and edits.
            key={index}
            index={index}
            repository={repository}
            onChange={(changed) => {
              set({ repositories: draft.repositories.map((row, at) => (at === index ? changed : row)) });
            }}
            onRemove={() => {
              set({ repositories: draft.repositories.filter((_row, at) => at !== index) });
            }}
          />
        ))}
        <Button
          variant="ghost"
          disabled={draft.repositories.length >= MAX_REPOSITORIES}
          onClick={() => {
            set({ repositories: [...draft.repositories, EMPTY_REPOSITORY] });
          }}
        >
          {t('cloud.recipe.addRepository')}
        </Button>
        <div className="cl-form__grid">
          <span className="o-stack">
            <label htmlFor={ids.workingDirectory} className="o-field-label">
              {t('cloud.recipe.workingDirectory')}
            </label>
            <input
              id={ids.workingDirectory}
              className="o-input o-mono"
              autoComplete="off"
              spellCheck={false}
              placeholder="web"
              value={draft.workingDirectory}
              onChange={(event) => {
                set({ workingDirectory: event.target.value });
              }}
            />
          </span>
          <span className="o-stack">
            <label htmlFor={ids.variables} className="o-field-label">
              {t('cloud.recipe.requiredVariables')}
            </label>
            <input
              id={ids.variables}
              className="o-input o-mono"
              autoComplete="off"
              spellCheck={false}
              placeholder="NPM_TOKEN, SENTRY_DSN"
              value={draft.requiredVariables}
              onChange={(event) => {
                set({ requiredVariables: event.target.value });
              }}
            />
          </span>
        </div>
        <label htmlFor={ids.create} className="o-field-label">
          {t('cloud.recipe.create')}
        </label>
        <textarea
          id={ids.create}
          className="o-input o-mono"
          rows={2}
          spellCheck={false}
          placeholder="pnpm install"
          value={draft.create}
          onChange={(event) => {
            set({ create: event.target.value });
          }}
        />
        <label htmlFor={ids.start} className="o-field-label">
          {t('cloud.recipe.start')}
        </label>
        <textarea
          id={ids.start}
          className="o-input o-mono"
          rows={2}
          spellCheck={false}
          placeholder="docker compose up -d"
          value={draft.start}
          onChange={(event) => {
            set({ start: event.target.value });
          }}
        />
        <div className="cl-form__grid">
          <label htmlFor={ids.github} className="o-inline">
            <input
              id={ids.github}
              type="checkbox"
              checked={draft.requireGitHub}
              onChange={(event) => {
                set({ requireGitHub: event.target.checked });
              }}
            />
            {t('cloud.recipe.requireGitHub')}
          </label>
          <span className="o-stack">
            <label htmlFor={ids.domain} className="o-field-label">
              {t('cloud.recipe.gitEmailDomain')}
            </label>
            <input
              id={ids.domain}
              className="o-input o-mono"
              autoComplete="off"
              spellCheck={false}
              placeholder="acme.dev"
              value={draft.gitEmailDomain}
              onChange={(event) => {
                set({ gitEmailDomain: event.target.value });
              }}
            />
          </span>
        </div>
      </div>
    </details>
  );
}
