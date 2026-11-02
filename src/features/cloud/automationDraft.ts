// SPDX-License-Identifier: AGPL-3.0-only
import type { Automation, AutomationVariable, AutomationWrite } from '@gen/api/types.gen';

export const TRIGGER_KINDS = ['cron', 'webhook'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export function isTriggerKind(value: string): value is TriggerKind {
  return TRIGGER_KINDS.some((kind) => kind === value);
}

/** What a trigger does while a run still works: the two the server accepts. */
export const OVERLAPS = ['skip', 'allow'] as const;
export type OverlapMode = (typeof OVERLAPS)[number];

export function isOverlap(value: string): value is OverlapMode {
  return OVERLAPS.some((mode) => mode === value);
}

export const VARIABLE_TYPES = ['string', 'int', 'number', 'boolean', 'enum'] as const;

/** The server's limits (`AutomationRules`): the form says so before a round trip. */
export const LIMITS = {
  name: 120,
  prompt: 32_000,
  variables: 32,
  runtimeMinutes: 1440,
  runsPerDay: 1000,
} as const;

export interface VariableDraft {
  /** Where the row stays on screen while it is typed; never sent. */
  readonly key: number;
  readonly name: string;
  readonly path: string;
  readonly type: string;
  /** The values of an enum, separated by commas. */
  readonly values: string;
  readonly required: boolean;
  readonly sensitive: boolean;
}

/** An automation as its form holds it: numbers and JSON as typed, so a half-typed value is never lost. */
export interface AutomationDraft {
  readonly name: string;
  readonly kind: TriggerKind;
  readonly cron: string;
  readonly timezone: string;
  readonly agent: string;
  readonly prompt: string;
  readonly model: string;
  readonly runtime: string;
  readonly runsPerDay: string;
  readonly overlap: OverlapMode;
  readonly variables: readonly VariableDraft[];
  readonly sample: string;
}

/** The time zone of this browser, the one a new schedule most likely means. */
export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function variableDraft(variable: AutomationVariable, key: number): VariableDraft {
  return {
    key,
    name: variable.name,
    path: variable.path,
    type: variable.type,
    values: (variable.values ?? []).join(', '),
    // The server's defaults: a variable is required unless it says otherwise.
    required: variable.required ?? true,
    sensitive: variable.sensitive ?? false,
  };
}

const NEW_CRON = '0 9 * * 1-5';

/** The draft of a new automation (a weekday schedule here), or of `automation` as it stands. */
export function automationDraftOf(automation: Automation | undefined, timezone: string): AutomationDraft {
  if (automation === undefined) {
    return {
      name: '',
      kind: 'cron',
      cron: NEW_CRON,
      timezone,
      agent: 'claude',
      prompt: '',
      model: '',
      runtime: '60',
      runsPerDay: '24',
      overlap: 'skip',
      variables: [],
      sample: '',
    };
  }
  const { trigger, action } = automation;
  return {
    name: automation.name,
    kind: trigger.kind,
    // A webhook switched to a schedule starts from the same weekday schedule as a new one.
    cron: trigger.cron ?? NEW_CRON,
    timezone: trigger.timezone ?? timezone,
    agent: action.agent ?? 'claude',
    prompt: action.prompt ?? '',
    model: action.model ?? '',
    runtime: String(action.maxRuntimeMinutes ?? 60),
    runsPerDay: String(automation.maxRunsPerDay ?? 24),
    overlap: automation.overlap === 'allow' ? 'allow' : 'skip',
    variables: (automation.variables ?? []).map(variableDraft),
    sample: automation.samplePayload === undefined ? '' : JSON.stringify(automation.samplePayload, null, 2),
  };
}

/** A whole number written in the field, between `min` and `max`; anything else is undefined. */
export function wholeNumber(text: string, min: number, max: number): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined;
  const value = Number(text.trim());
  return value >= min && value <= max ? value : undefined;
}

/** A cron of five fields, or a macro such as `@hourly`: the server reads the rest. */
export function looksLikeCron(text: string): boolean {
  const cron = text.trim();
  return /^@[a-z]+$/.test(cron) || cron.split(/\s+/).length === 5;
}

/** The sample payload: absent when empty, an object when it parses as one, `invalid` otherwise. */
export function sampleOf(text: string): Record<string, unknown> | undefined | 'invalid' {
  if (text.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'invalid';
    return Object.fromEntries(Object.entries(parsed));
  } catch {
    return 'invalid';
  }
}

function valuesOf(text: string): string[] {
  return text
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

export type AutomationProblem =
  | 'name'
  | 'cron'
  | 'timezone'
  | 'prompt'
  | 'runtime'
  | 'runsPerDay'
  | 'variables'
  | 'variable'
  | 'enum'
  | 'sample';

/** The first thing the server would refuse that the form can see; undefined when the draft may be sent. */
export function automationProblem(draft: AutomationDraft): AutomationProblem | undefined {
  const name = draft.name.trim();
  if (name === '' || name.length > LIMITS.name) return 'name';
  if (draft.kind === 'cron') {
    if (!looksLikeCron(draft.cron)) return 'cron';
    if (draft.timezone.trim() === '') return 'timezone';
  }
  if (draft.prompt.trim() === '' || draft.prompt.length > LIMITS.prompt) return 'prompt';
  if (wholeNumber(draft.runtime, 1, LIMITS.runtimeMinutes) === undefined) return 'runtime';
  if (wholeNumber(draft.runsPerDay, 1, LIMITS.runsPerDay) === undefined) return 'runsPerDay';
  if (draft.kind === 'webhook') {
    if (draft.variables.length > LIMITS.variables) return 'variables';
    if (draft.variables.some((variable) => variable.name.trim() === '' || variable.path.trim() === ''))
      return 'variable';
    if (
      draft.variables.some((variable) => variable.type === 'enum' && valuesOf(variable.values).length === 0)
    )
      return 'enum';
    if (sampleOf(draft.sample) === 'invalid') return 'sample';
  }
  return undefined;
}

function variableOf(draft: VariableDraft, before: AutomationVariable | undefined): AutomationVariable {
  const values = draft.type === 'enum' ? valuesOf(draft.values) : [];
  return {
    name: draft.name.trim(),
    path: draft.path.trim(),
    type: draft.type,
    ...(values.length === 0 ? {} : { values }),
    // A length set elsewhere (the API, the CLI) is kept: this form does not show it.
    ...(before?.maxLength === undefined ? {} : { maxLength: before.maxLength }),
    required: draft.required,
    sensitive: draft.sensitive,
  };
}

/**
 * The body the server reads (`AutomationWrite`). What the form does not show (a cron's catch-up, an agent's effort, a
 * variable's length) is kept from `automation`; an edit sends the version it read, so a change made since is refused.
 * A webhook has no schedule and a schedule has no payload: switching the trigger drops what the other one had.
 */
export function automationWriteOf(draft: AutomationDraft, automation?: Automation): AutomationWrite {
  const before = automation?.trigger;
  const effort = automation?.action.effort;
  const model = draft.model.trim();
  const sample = sampleOf(draft.sample);
  const webhook = draft.kind === 'webhook';
  return {
    name: draft.name.trim(),
    trigger: webhook
      ? { kind: 'webhook' }
      : {
          kind: 'cron',
          cron: draft.cron.trim(),
          timezone: draft.timezone.trim(),
          ...(before?.catchup === undefined ? {} : { catchup: before.catchup }),
          ...(before?.catchupGraceMinutes === undefined
            ? {}
            : { catchupGraceMinutes: before.catchupGraceMinutes }),
        },
    action: {
      prompt: draft.prompt,
      agent: draft.agent,
      ...(model === '' ? {} : { model }),
      ...(effort === undefined ? {} : { effort }),
      maxRuntimeMinutes: Number(draft.runtime.trim()),
    },
    variables: webhook
      ? draft.variables.map((variable) =>
          variableOf(
            variable,
            automation?.variables?.find((known) => known.name === variable.name.trim()),
          ),
        )
      : [],
    ...(webhook && sample !== undefined && sample !== 'invalid' ? { samplePayload: sample } : {}),
    overlap: draft.overlap,
    maxRunsPerDay: Number(draft.runsPerDay.trim()),
    ...(automation === undefined ? {} : { version: automation.version }),
  };
}

/** A new, empty variable row, keyed after the others. */
export function addVariable(variables: readonly VariableDraft[]): VariableDraft[] {
  const key = variables.reduce((last, variable) => Math.max(last, variable.key + 1), 0);
  return [
    ...variables,
    { key, name: '', path: '$.', type: 'string', values: '', required: true, sensitive: false },
  ];
}

/** Whether the person viewing owns it: the server names an owner by member id, the demo by login. */
export function ownsAutomation(
  automation: Automation,
  viewer: { readonly login: string | undefined; readonly memberId: string | undefined },
): boolean {
  return automation.owner === viewer.login || automation.owner === viewer.memberId;
}
