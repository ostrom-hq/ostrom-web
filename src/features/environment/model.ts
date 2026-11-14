// SPDX-License-Identifier: Apache-2.0
import type {
  EnvironmentAssignment,
  EnvironmentAssignmentsPage,
  EnvironmentExclusion,
  EnvironmentVariant,
  EnvironmentVariantCreate,
  Member,
} from '@gen/api/types.gen';

/** An environment variable's name, as the server takes it: `[A-Z_][A-Z0-9_]*`, at most 128 characters. */
export const ENV_VARIABLE = /^[A-Z_][A-Z0-9_]{0,127}$/;
/** A variant's name: 1 to 120 characters. */
export const VARIANT_NAME_MAX = 120;
/** A value: 1 to 16,384 characters. */
export const VALUE_MAX = 16_384;

export const BINDINGS = ['shared', 'perMember'] as const;
export type Binding = (typeof BINDINGS)[number];

/** A binding the console knows; another one a newer server sends reads as `perMember`, the one that stores nothing. */
export function bindingOf(value: string): Binding {
  return value === 'shared' ? 'shared' : 'perMember';
}

export interface VariantDraft {
  readonly variable: string;
  readonly name: string;
  readonly binding: Binding;
  readonly value: string;
}

export type VariantDraftProblem = 'variable' | 'name' | 'value';

/** What stops a variant from being created, in the order the form reads, or the body to send. */
export function checkVariant(
  draft: VariantDraft,
): { readonly problem: VariantDraftProblem } | { readonly body: EnvironmentVariantCreate } {
  const variable = draft.variable.trim();
  if (!ENV_VARIABLE.test(variable)) return { problem: 'variable' };
  const name = draft.name.trim();
  if (name === '' || name.length > VARIANT_NAME_MAX) return { problem: 'name' };
  // A per-member variant stores no value of its own: one left in the field is dropped, not sent (TeamCode does so).
  if (draft.binding === 'perMember') return { body: { variable, name, binding: 'perMember' } };
  if (draft.value === '' || draft.value.length > VALUE_MAX) return { problem: 'value' };
  return { body: { variable, name, binding: 'shared', value: draft.value } };
}

/** How a member is named on the page: their name and login, or the login alone. */
export function memberLabel(member: Member): string {
  return member.name === undefined || member.name === '' ? member.login : `${member.name} (${member.login})`;
}

/** One member's row of the effective assignments: what they receive and what they are excluded from. */
export interface MemberEnvironment {
  readonly id: string;
  /** Their name, or their id when the member list could not be read or no longer lists them. */
  readonly label: string;
  /**
   * The member list names them (or could not be read): they can be picked to assign or exclude. A member who left
   * keeps their rows on display only.
   */
  readonly listed: boolean;
  readonly assignments: readonly EnvironmentAssignment[];
  readonly exclusions: readonly EnvironmentExclusion[];
}

/**
 * Every member with what they receive, in the order of the member list, then any member the assignments name that
 * the list does not (by id). An invitation not accepted yet has no member to assign to.
 */
export function memberRows(
  members: readonly Member[] | undefined,
  page: EnvironmentAssignmentsPage,
): MemberEnvironment[] {
  const known = (members ?? []).filter((member) => member.role !== 'invited');
  const ids = [
    ...known.map((member) => member.id),
    ...page.items.map((assignment) => assignment.member),
    ...page.exclusions.map((exclusion) => exclusion.member),
  ];
  return [...new Set(ids)].map((id) => {
    const member = known.find((candidate) => candidate.id === id);
    return {
      id,
      label: member === undefined ? id : memberLabel(member),
      listed: members === undefined || member !== undefined,
      assignments: page.items
        .filter((assignment) => assignment.member === id)
        .toSorted((a, b) => a.variable.localeCompare(b.variable)),
      exclusions: page.exclusions
        .filter((exclusion) => exclusion.member === id)
        .toSorted((a, b) => a.variable.localeCompare(b.variable)),
    };
  });
}

/** Team variants by variable, then name: the order the server lists them in, kept whatever it sends. */
export function sortVariants(variants: readonly EnvironmentVariant[]): EnvironmentVariant[] {
  return variants.toSorted((a, b) => {
    const byVariable = a.variable.localeCompare(b.variable);
    return byVariable === 0 ? a.name.localeCompare(b.name) : byVariable;
  });
}

/** What a variant says of its value: each member's own, stored once, or none (never the value itself). */
export function valueState(variant: EnvironmentVariant): 'perMember' | 'stored' | 'none' {
  if (bindingOf(variant.binding) === 'perMember') return 'perMember';
  return variant.hasValue ? 'stored' : 'none';
}

/** A list with a first item, so a form that picks from it always has a choice. */
export type NonEmpty<T> = readonly [T, ...T[]];

export function isNonEmpty<T>(items: readonly T[]): items is NonEmpty<T> {
  return items.length > 0;
}

/** A member's personal variant and its owner's id; one the server sends without an owner is not a personal one. */
export interface PersonalVariant {
  readonly variant: EnvironmentVariant;
  readonly owner: string;
}

export function personalOf(items: readonly EnvironmentVariant[]): PersonalVariant[] {
  return items.flatMap((variant) => (variant.owner === undefined ? [] : [{ variant, owner: variant.owner }]));
}
