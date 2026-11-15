// SPDX-License-Identifier: Apache-2.0

/** The server's model and effort rules (as at creation, the same for both): 1 to 120 letters, digits and `. _ : / -`. */
export const MAX_MODEL = 120;

const MODEL = /^[a-zA-Z0-9._:/-]+$/;

export function validModel(model: string): boolean {
  return model.length >= 1 && model.length <= MAX_MODEL && MODEL.test(model);
}

/** What the effort picker suggests for `agent`, lowest first; any other valid value can be typed. */
export function effortLevels(agent: string): readonly string[] {
  return agent === 'codex' ? ['low', 'medium', 'high', 'xhigh'] : ['low', 'medium', 'high', 'xhigh', 'max'];
}

/** 42 s, 3 min 05 s, 1 h 12 min: the parts of a duration, for the wording to join. */
export type Duration =
  | { readonly unit: 'seconds'; readonly seconds: number }
  | { readonly unit: 'minutes'; readonly minutes: number; readonly seconds: number }
  | { readonly unit: 'hours'; readonly hours: number; readonly minutes: number };

export function durationOf(millis: number): Duration {
  const seconds = Math.max(Math.floor(millis / 1000), 0);
  if (seconds < 60) return { unit: 'seconds', seconds };
  if (seconds < 3600) return { unit: 'minutes', minutes: Math.floor(seconds / 60), seconds: seconds % 60 };
  return { unit: 'hours', hours: Math.floor(seconds / 3600), minutes: Math.floor((seconds % 3600) / 60) };
}
