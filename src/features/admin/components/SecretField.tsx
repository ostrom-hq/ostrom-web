// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { SECRET_MAX, type SecretIntent } from '../model';

export interface SecretFieldProps {
  readonly name: string;
  readonly required: boolean;
  /** The secret is set on the server. Its value is never known to the console. */
  readonly configured: boolean;
  readonly intent: SecretIntent;
  readonly disabled: boolean;
  readonly onChange: (intent: SecretIntent) => void;
}

type IntentKind = SecretIntent['kind'];

/**
 * A write-only secret: shown as set or not set, never its value. Keep leaves it as it is, replace writes what is
 * typed, remove takes it away (only offered for a secret that is set).
 */
export function SecretField({
  name,
  required,
  configured,
  intent,
  disabled,
  onChange,
}: SecretFieldProps): ReactElement {
  const { t } = useTranslation();
  const selectId = useId();
  const valueId = useId();
  const kinds: readonly IntentKind[] = configured ? ['keep', 'replace', 'remove'] : ['keep', 'replace'];
  return (
    <div className="o-stack">
      <span className="o-inline">
        <label htmlFor={selectId} className="o-field-label">
          {name}
          {required ? <span className="o-row__meta"> {t('admin.settings.required')}</span> : null}
        </label>
        <Badge tone={configured ? 'success' : 'neutral'}>
          {configured ? t('admin.settings.secret.set') : t('admin.settings.secret.notSet')}
        </Badge>
      </span>
      <select
        id={selectId}
        className="o-input o-select"
        value={intent.kind}
        disabled={disabled}
        onChange={(event) => {
          const chosen = kinds.find((kind) => kind === event.target.value);
          if (chosen === 'replace') onChange({ kind: 'replace', value: '' });
          else if (chosen === 'remove') onChange({ kind: 'remove' });
          else onChange({ kind: 'keep' });
        }}
      >
        {kinds.map((kind) => (
          <option key={kind} value={kind}>
            {t(`admin.settings.secret.${kind}`)}
          </option>
        ))}
      </select>
      {intent.kind === 'replace' ? (
        <>
          <label htmlFor={valueId} className="o-visually-hidden">
            {t('admin.settings.secret.newValue', { name })}
          </label>
          <input
            id={valueId}
            type="password"
            className="o-input"
            autoComplete="new-password"
            maxLength={SECRET_MAX}
            placeholder={t('admin.settings.secret.newValue', { name })}
            value={intent.value}
            disabled={disabled}
            onChange={(event) => {
              onChange({ kind: 'replace', value: event.target.value });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
