// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import {
  toggleEventType,
  WEBHOOK_DESCRIPTION_MAX,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_URL_MAX,
  webhookDraftProblem,
} from '../model';
import type { WebhookDraft } from '../useWebhooks';

export interface WebhookFormProps {
  readonly initial: WebhookDraft;
  /** The settings of an existing webhook carry the Enabled box; a new webhook starts enabled. */
  readonly enabled?: boolean;
  readonly submit: string;
  readonly submitting: string;
  readonly pending: boolean;
  /** Nothing is sent while a secret is on screen to be copied. */
  readonly locked?: boolean;
  /** Runs with what the form holds; it never runs while the draft is not valid. */
  readonly onSubmit: (draft: WebhookDraft, enabled: boolean) => void;
}

/** A target, a label, the events it receives: the form of a new webhook and of an existing one's settings. */
export function WebhookForm({
  initial,
  enabled,
  submit,
  submitting,
  pending,
  locked = false,
  onSubmit,
}: WebhookFormProps): ReactElement {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initial.url);
  const [description, setDescription] = useState(initial.description);
  const [types, setTypes] = useState<readonly string[]>(initial.types);
  const [on, setOn] = useState(enabled ?? true);
  const urlId = useId();
  const descriptionId = useId();
  const problem = webhookDraftProblem(url, types);
  // The types the webhook already has stay offered, even when the console does not know one.
  const offered = [...WEBHOOK_EVENT_TYPES, ...initial.types.filter((type) => !isOffered(type))];
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ url, description, types }, on);
      }}
    >
      <label htmlFor={urlId} className="o-field-label">
        {t('webhooks.form.url')}
      </label>
      <input
        id={urlId}
        className="o-input"
        type="url"
        required
        maxLength={WEBHOOK_URL_MAX}
        placeholder={t('webhooks.form.urlPlaceholder')}
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
        }}
      />
      <label htmlFor={descriptionId} className="o-field-label">
        {t('webhooks.form.description')}
      </label>
      <input
        id={descriptionId}
        className="o-input"
        maxLength={WEBHOOK_DESCRIPTION_MAX}
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />
      <fieldset className="o-stack wh-types">
        <legend className="o-field-label">{t('webhooks.form.types')}</legend>
        {offered.map((type) => (
          <label key={type} className="o-inline wh-type">
            <input
              type="checkbox"
              checked={types.includes(type)}
              onChange={(event) => {
                setTypes(toggleEventType(types, type, event.target.checked));
              }}
            />
            <span className="o-mono">{type}</span>
          </label>
        ))}
      </fieldset>
      {enabled === undefined ? null : (
        <label className="o-inline wh-type">
          <input
            type="checkbox"
            checked={on}
            onChange={(event) => {
              setOn(event.target.checked);
            }}
          />
          <span>{t('webhooks.form.enabled')}</span>
        </label>
      )}
      {problem === 'url' && url !== '' ? <p className="o-row__meta">{t('webhooks.form.httpsOnly')}</p> : null}
      {problem === 'types' ? <p className="o-row__meta">{t('webhooks.form.pickType')}</p> : null}
      <div className="o-inline">
        <Button type="submit" disabled={locked || pending || problem !== undefined}>
          {pending ? submitting : submit}
        </Button>
      </div>
    </form>
  );
}

function isOffered(type: string): boolean {
  return WEBHOOK_EVENT_TYPES.some((known) => known === type);
}
