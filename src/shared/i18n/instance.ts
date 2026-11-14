// SPDX-License-Identifier: Apache-2.0
import type { WordingKey } from '@/shared/i18n/types';

/** Wording as the console keeps it: sections of keys, of sections or texts. */
export type Wording = Readonly<Record<string, unknown>>;

/** What a text takes in its `{{name}}` placeholders; `count` also picks the plural form. */
export type Vars = Readonly<Record<string, string | number | boolean | undefined>>;

/** Gives the text at a key, in the language it was made for. */
export type TFunction = (key: WordingKey, vars?: Vars) => string;

type Event = 'languageChanged' | 'added';
type Listener = (language: string) => void;

/** The words of the language shown, and what a screen needs to render again when they change. */
export interface I18n {
  /** The language shown. */
  readonly language: string;
  /** The text at `key` in the language shown. */
  readonly t: TFunction;
  /** What `t` is, for a language: it does not follow the one shown. */
  getFixedT: (language: string) => TFunction;
  /** Shows `language`, with the wording it has been given. */
  changeLanguage: (language: string) => void;
  /** What is at a dotted `key` of a language's wording. */
  getResource: (language: string, key: string) => unknown;
  /** Adds words to a language's wording, over what it had. */
  addResourceBundle: (language: string, wording: Wording) => void;
  hasResourceBundle: (language: string) => boolean;
  /** `languageChanged` when another language is shown; `added` when words are added. */
  on: (event: Event, listener: Listener) => void;
  off: (event: Event, listener: Listener) => void;
}

function isWording(value: unknown): value is Wording {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `over` laid on `base`, section by section: a text of `over` wins, a section of `over` is merged in. */
function merged(base: Wording, over: Wording): Wording {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const had = result[key];
    result[key] = isWording(value) && isWording(had) ? merged(had, value) : value;
  }
  return result;
}

/**
 * What is at a dotted `key` under `node`. A key may itself hold dots (`'gate.requested'` in a section of keys of
 * events), so each head of the key is tried as a whole name before it is read as a section.
 */
function find(node: unknown, key: string): unknown {
  if (!isWording(node)) return undefined;
  if (Object.hasOwn(node, key)) return node[key];
  for (let dot = key.indexOf('.'); dot !== -1; dot = key.indexOf('.', dot + 1)) {
    const found = find(node[key.slice(0, dot)], key.slice(dot + 1));
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `{{name}}` filled with `vars`; a placeholder without a value gives nothing. */
function filled(text: string, vars: Vars): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_placeholder, name: string) => String(vars[name] ?? ''));
}

/** A new instance showing `language`, with no wording yet: `t` gives the key until some is added. */
export function createI18n(language = 'en'): I18n {
  const wordings = new Map<string, Wording>();
  const listeners: Record<Event, Set<Listener>> = { languageChanged: new Set(), added: new Set() };
  const rules = new Map<string, Intl.PluralRules>();
  let shown = language;

  const emit = (event: Event, about: string): void => {
    for (const listener of [...listeners[event]]) listener(about);
  };

  const plural = (of: string, count: number): Intl.LDMLPluralRule => {
    let rule = rules.get(of);
    if (rule === undefined) {
      rule = new Intl.PluralRules(of);
      rules.set(of, rule);
    }
    return rule.select(count);
  };

  const translate = (of: string, key: string, vars: Vars | undefined): string => {
    const wording = wordings.get(of);
    const count = vars?.['count'];
    const candidates =
      typeof count === 'number' ? [`${key}_${plural(of, count)}`, `${key}_other`, key] : [key];
    for (const candidate of candidates) {
      const found = find(wording, candidate);
      if (typeof found === 'string') return vars === undefined ? found : filled(found, vars);
    }
    return key;
  };

  return {
    get language() {
      return shown;
    },
    t: (key, vars) => translate(shown, key, vars),
    getFixedT: (fixed) => (key, vars) => translate(fixed, key, vars),
    changeLanguage(next) {
      shown = next;
      emit('languageChanged', next);
    },
    getResource: (of, key) => find(wordings.get(of), key),
    addResourceBundle(to, wording) {
      wordings.set(to, merged(wordings.get(to) ?? {}, wording));
      emit('added', to);
    },
    hasResourceBundle: (of) => wordings.has(of),
    on(event, listener) {
      listeners[event].add(listener);
    },
    off(event, listener) {
      listeners[event].delete(listener);
    },
  };
}
