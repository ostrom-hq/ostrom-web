// SPDX-License-Identifier: AGPL-3.0-only
import type { i18n as I18n } from 'i18next';
import { useTranslation } from 'react-i18next';

/** Values an interpolated label takes, as i18next's `{{name}}`. */
export type LabelVars = Readonly<Record<string, string>>;

const FALLBACK_LANGUAGE = 'en';

function wordingOf(i18n: I18n, key: string): string | undefined {
  for (const language of [i18n.language, FALLBACK_LANGUAGE]) {
    const found: unknown = i18n.getResource(language, 'translation', key);
    if (typeof found === 'string') return found;
  }
  return undefined;
}

/**
 * The label of an enum value (CS-04: enums are open, a newer server may send a value this console does not know):
 * the wording at `<prefix>.<value>` when there is one, the raw value as text when there is none. The generated types
 * keep the known values for completion, but a label key built from a value cannot be typed, so it is looked up here.
 */
export function enumLabel(i18n: I18n, prefix: string, value: string, vars: LabelVars = {}): string {
  const wording = wordingOf(i18n, `${prefix}.${value}`);
  if (wording === undefined) return value;
  return wording.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) => vars[name] ?? placeholder);
}

/** `enumLabel` bound to the language shown: `const label = useEnumLabel(); label('confirm.status', status)`. */
export function useEnumLabel(): (prefix: string, value: string, vars?: LabelVars) => string {
  const { i18n } = useTranslation();
  return (prefix, value, vars) => enumLabel(i18n, prefix, value, vars);
}
