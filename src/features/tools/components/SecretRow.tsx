// SPDX-License-Identifier: Apache-2.0
import type { Secret } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';

export interface SecretRowProps {
  readonly secret: Secret;
  readonly busy: boolean;
  /** Present when the viewer manages the secrets. */
  readonly actions:
    | {
        readonly rotate: (value: string, onDone: () => void) => void;
        readonly remove: () => void;
      }
    | undefined;
}

/** A secret shows who changed it and what uses it, never its value: there is nothing to read back. */
export function SecretRow({ secret, busy, actions }: SecretRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [rotating, setRotating] = useState(false);
  const [value, setValue] = useState('');
  const valueId = useId();
  return (
    <div className="o-row tl-secret">
      <span className="o-row__main">
        <span className="o-row__title o-mono">{secret.name}</span>
        <span className="o-row__meta">
          {[
            t('tools.scope', { scope: secret.scope }),
            t('tools.secrets.changed', {
              who: secret.updatedBy,
              when: formatAbsolute(secret.updatedAt, i18n.language),
            }),
            secret.usedBy === undefined || secret.usedBy.length === 0
              ? t('tools.secrets.unused')
              : t('tools.secrets.usedBy', { list: secret.usedBy.join(', ') }),
          ].join(' · ')}
        </span>
        {actions !== undefined && rotating ? (
          <form
            className="o-inline"
            onSubmit={(event) => {
              event.preventDefault();
              actions.rotate(value, () => {
                setValue('');
                setRotating(false);
              });
            }}
          >
            <label htmlFor={valueId} className="o-visually-hidden">
              {t('tools.secrets.newValue', { name: secret.name })}
            </label>
            <input
              id={valueId}
              className="o-input o-mono"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
            <Button type="submit" disabled={busy || value === ''}>
              {t('tools.secrets.saveValue')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setValue('');
                setRotating(false);
              }}
            >
              {t('tools.secrets.cancel')}
            </Button>
          </form>
        ) : null}
      </span>
      {actions === undefined || rotating ? null : (
        <span className="o-inline">
          <Button
            disabled={busy}
            onClick={() => {
              setRotating(true);
            }}
          >
            {t('tools.secrets.rotate')}
          </Button>
          <ConfirmButton
            label={t('tools.remove.ask')}
            confirm={t('tools.remove.confirm', { what: secret.name })}
            keep={t('tools.remove.keep')}
            disabled={busy}
            onConfirm={actions.remove}
          />
        </span>
      )}
    </div>
  );
}
