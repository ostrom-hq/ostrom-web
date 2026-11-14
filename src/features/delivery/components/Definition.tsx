// SPDX-License-Identifier: Apache-2.0
import type { HookDefinition } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { factsOf } from '../model';

/** When and what a hook runs: its events, its matcher, its command and its timeout. */
export function Definition({ definition }: { readonly definition: HookDefinition }): ReactElement {
  const { t } = useTranslation();
  const facts = factsOf(definition);
  return (
    <>
      <span className="o-row__meta o-mono">{facts.events}</span>
      {facts.matcher === undefined ? null : (
        <span className="o-row__meta">
          {t('delivery.hooks.matcher')} <span className="o-mono">{facts.matcher}</span>
        </span>
      )}
      <span className="o-row__meta">
        {t('delivery.hooks.runs')} <span className="o-mono">{facts.command}</span>
        {`, ${t('delivery.hooks.timeout', { seconds: facts.timeoutSeconds })}`}
      </span>
    </>
  );
}
