// SPDX-License-Identifier: Apache-2.0
import type { CloudSession } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { effortLevels, MAX_MODEL, validModel } from '../controls';
import type { SessionControlsViewModel } from '../useSessionControls';

/**
 * A model or an effort: its current value, and for the owner "Change", which opens a field (with the agent's usual
 * efforts suggested) and Switch, offered once another valid value is typed.
 */
function ValuePicker({
  label,
  hint,
  current,
  suggestions,
  busy,
  onApply,
}: {
  readonly label: string;
  readonly hint: string;
  readonly current: string | undefined;
  readonly suggestions: readonly string[];
  readonly busy: boolean;
  readonly onApply: (value: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState('');
  const sent = chosen.trim();
  const valid = validModel(sent);
  const shown = current ?? t('cloudConversation.controls.defaultValue');
  if (!editing)
    return (
      <span className="o-inline">
        <span className="o-label">{label}</span>
        <span className="o-mono">{shown}</span>
        <Button
          variant="ghost"
          aria-label={`${t('cloudConversation.controls.change')} ${label}`}
          disabled={busy}
          onClick={() => {
            setChosen(current ?? '');
            setEditing(true);
          }}
        >
          {t('cloudConversation.controls.change')}
        </Button>
      </span>
    );
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        // Enter submits only while Switch is enabled: a valid value, another one, nothing on its way.
        event.preventDefault();
        setEditing(false);
        onApply(sent);
      }}
    >
      <label htmlFor={id} className="o-field-label">
        {label}
      </label>
      <input
        id={id}
        className="o-input o-mono"
        list={suggestions.length === 0 ? undefined : `${id}-list`}
        value={chosen}
        aria-invalid={!valid && chosen !== ''}
        onChange={(event) => {
          setChosen(event.target.value);
        }}
      />
      {suggestions.length === 0 ? null : (
        <datalist id={`${id}-list`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      <span className={!valid && chosen !== '' ? 'cc-danger' : 'cc-meta'}>
        {!valid && chosen !== '' ? t('cloudConversation.controls.invalid', { max: MAX_MODEL }) : hint}
      </span>
      <span className="o-inline">
        <Button type="submit" disabled={!valid || sent === current || busy}>
          {t('cloudConversation.controls.apply')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setEditing(false);
          }}
        >
          {t('cloudConversation.controls.cancel')}
        </Button>
      </span>
    </form>
  );
}

/**
 * The session's settings, for its owner (TeamCode's companion session header and menu): the standing approval of tool
 * uses, turned on after a confirmation and off at once, the model and the effort.
 */
export function SessionControls({
  session,
  view,
}: {
  readonly session: CloudSession;
  readonly view: SessionControlsViewModel;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!view.bypassAvailable && !view.modelAvailable && !view.effortAvailable) return null;
  return (
    <section className="cc-controls" aria-label={t('cloudConversation.controls.label')}>
      {view.bypassAvailable ? (
        <span className="o-inline">
          {session.permissionBypass === true ? (
            <>
              <Badge tone="warning">{t('cloudConversation.controls.bypassOn')}</Badge>
              <Button
                disabled={view.acting}
                onClick={() => {
                  void view.setBypass(false);
                }}
              >
                {t('cloudConversation.controls.revokeBypass')}
              </Button>
            </>
          ) : (
            <>
              <span className="cc-meta">{t('cloudConversation.controls.bypassOff')}</span>
              <ConfirmButton
                tone="secondary"
                label={t('cloudConversation.controls.enableBypass')}
                confirm={t('cloudConversation.controls.confirmBypass')}
                keep={t('cloudConversation.controls.keep')}
                disabled={view.acting}
                onConfirm={() => {
                  void view.setBypass(true);
                }}
              />
            </>
          )}
        </span>
      ) : null}
      {view.modelAvailable ? (
        <ValuePicker
          label={t('cloudConversation.controls.model')}
          hint={t('cloudConversation.controls.modelHint')}
          current={session.model}
          suggestions={[]}
          busy={view.acting}
          onApply={view.setModel}
        />
      ) : null}
      {view.effortAvailable ? (
        <ValuePicker
          label={t('cloudConversation.controls.effort')}
          hint={t('cloudConversation.controls.effortHint')}
          current={session.effort}
          suggestions={effortLevels(session.agent)}
          busy={view.acting}
          onApply={view.setEffort}
        />
      ) : null}
      {view.failure === undefined ? null : (
        <p className="cc-danger" role="alert">
          {view.failure.message}
        </p>
      )}
    </section>
  );
}
