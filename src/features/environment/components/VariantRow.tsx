// SPDX-License-Identifier: Apache-2.0
import type { EnvironmentBulkAssignment, EnvironmentVariant } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { bindingOf, VALUE_MAX, VARIANT_NAME_MAX, valueState } from '../model';
import { Field } from './Field';

export interface VariantRowProps {
  readonly variant: EnvironmentVariant;
  readonly busy: boolean;
  /** What the last bulk assignment of this variant did, if it was the last gesture. */
  readonly bulkResult: EnvironmentBulkAssignment | undefined;
  /** `expectedVersion`: the version the edit was opened on, so a change made meanwhile is a conflict, not overwritten. */
  readonly update: (
    change: { readonly name: string; readonly value: string; readonly expectedVersion: number },
    onDone: () => void,
  ) => void;
  readonly remove: () => void;
  /** Absent for a per-member variant: it cannot be assigned in bulk. */
  readonly bulkAssign: (() => void) | undefined;
}

/** A team variant: its variable, name, version and binding, never its value; edit, delete, assign to everyone. */
export function VariantRow({
  variant,
  busy,
  bulkResult,
  update,
  remove,
  bulkAssign,
}: VariantRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(variant.name);
  const [opened, setOpened] = useState(variant);
  const [value, setValue] = useState('');
  const shared = bindingOf(variant.binding) === 'shared';
  const label = `${variant.variable}: ${variant.name}`;
  const close = (): void => {
    setEditing(false);
    setName(variant.name);
    setValue('');
  };
  return (
    <li className="o-row env-row">
      <span className="o-row__main">
        <span className="o-inline">
          <span className="o-row__title o-mono">{variant.variable}</span>
          <span>{variant.name}</span>
          <Badge tone={shared ? 'signal' : 'neutral'}>
            {t(`environment.binding.${bindingOf(variant.binding)}.short`)}
          </Badge>
        </span>
        <span className="o-row__meta">
          {[
            t('environment.variant.version', { version: variant.version }),
            t(`environment.variant.value.${valueState(variant)}`),
            t('environment.variant.updated', { at: formatAbsolute(variant.updatedAt, i18n.language) }),
          ].join(' · ')}
        </span>
        {bulkResult === undefined ? null : (
          <span className="o-row__meta" role="status">
            {t('environment.variant.bulkDone', {
              assigned: bulkResult.assigned,
              kept: bulkResult.keptDirect,
              excluded: bulkResult.excluded,
            })}
          </span>
        )}
        {editing ? (
          <form
            className="o-stack"
            aria-label={t('environment.variant.editTitle', { what: label })}
            onSubmit={(event) => {
              event.preventDefault();
              update({ name, value, expectedVersion: opened.version }, close);
            }}
          >
            <Field
              label={t('environment.create.name')}
              maxLength={VARIANT_NAME_MAX}
              value={name}
              onChange={setName}
            />
            {shared ? (
              <Field
                label={t('environment.variant.newValue')}
                secret
                mono
                maxLength={VALUE_MAX}
                hint={t('environment.variant.newValueHint')}
                value={value}
                onChange={setValue}
              />
            ) : null}
            <div className="o-inline">
              <Button
                type="submit"
                disabled={busy || name.trim() === '' || (name.trim() === opened.name && value === '')}
              >
                {t('environment.variant.save')}
              </Button>
              <Button variant="ghost" onClick={close}>
                {t('environment.cancel')}
              </Button>
            </div>
          </form>
        ) : null}
      </span>
      {editing ? null : (
        <span className="o-row__end o-inline">
          {bulkAssign === undefined ? null : (
            <ConfirmButton
              tone="secondary"
              label={t('environment.variant.bulk')}
              confirm={t('environment.variant.bulkConfirm', { what: label })}
              keep={t('environment.keep')}
              disabled={busy}
              onConfirm={bulkAssign}
            />
          )}
          <Button
            variant="secondary"
            disabled={busy}
            aria-label={t('environment.variant.edit', { what: label })}
            onClick={() => {
              setOpened(variant);
              setName(variant.name);
              setEditing(true);
            }}
          >
            {t('environment.variant.editShort')}
          </Button>
          <ConfirmButton
            label={t('environment.remove')}
            confirm={t('environment.removeConfirm', { what: label })}
            keep={t('environment.keep')}
            disabled={busy}
            onConfirm={remove}
          />
        </span>
      )}
    </li>
  );
}
