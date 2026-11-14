// SPDX-License-Identifier: Apache-2.0
import { useSyncExternalStore } from 'react';
import { i18n } from '@/shared/i18n/i18n';
import type { I18n, TFunction } from '@/shared/i18n/instance';

/** The `t` of the words and language now shown: a new one each time they change, which is what a screen renders again for. */
let current: TFunction = i18n.getFixedT(i18n.language);
const listeners = new Set<() => void>();

function changed(): void {
  current = i18n.getFixedT(i18n.language);
  for (const listener of [...listeners]) listener();
}

// Always listening, not only while a screen is: a change between a screen's render and its subscription is seen.
i18n.on('languageChanged', changed);
i18n.on('added', changed);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): TFunction {
  return current;
}

/**
 * The words of the language shown: `const { t } = useTranslation()`. The screen renders again, with a new `t`, when
 * the person picks another language or more words come in (the whole language after the first screen's own).
 */
export function useTranslation(): { readonly t: TFunction; readonly i18n: I18n } {
  return { t: useSyncExternalStore(subscribe, snapshot), i18n };
}
