// SPDX-License-Identifier: AGPL-3.0-only
import type { Todo, TodoCheck, TodoHookEvent, TodoItem } from '@gen/api/types.gen';

/** The Stop hook errors the view lists: the newest three, as TeamCode's companion does. */
export const HOOK_ERRORS_SHOWN = 3;

/** Items that count: a dropped item is out of the plan, so the counter reads "4 / 9" of what is left to do. */
export function countedItems(todo: Todo): readonly TodoItem[] {
  return todo.items.filter((item) => item.status !== 'dropped');
}

export interface TodoCount {
  readonly done: number;
  readonly total: number;
}

export function todoCount(todo: Todo): TodoCount {
  const counted = countedItems(todo);
  return { done: counted.filter((item) => item.status === 'done').length, total: counted.length };
}

/** The item in progress, if any. */
export function currentItem(todo: Todo): TodoItem | undefined {
  return todo.items.find((item) => item.status === 'doing');
}

/** More than a third of the items rest on the agent's word alone (`attested` checks): the list is flagged. */
export function mostlyAttested(todo: Todo): boolean {
  const counted = countedItems(todo);
  return (
    counted.length >= 3 && counted.filter((item) => item.unverified === true).length * 3 > counted.length
  );
}

/** The errors the Stop hook recorded about itself (it failed open), the newest last. */
export function hookErrors(todo: Todo): readonly TodoHookEvent[] {
  return (todo.hookEvents ?? []).filter((event) => event.kind === 'hook_error').slice(-HOOK_ERRORS_SHOWN);
}

/** Every item is done or dropped, or the list is closed: the pill stops calling for attention. */
export function isFinished(todo: Todo): boolean {
  const { done, total } = todoCount(todo);
  return todo.status === 'done' || (total > 0 && done === total);
}

/** What a check looks at, the one field a person needs to read it. */
export function checkDetail(check: TodoCheck): string {
  switch (check.type) {
    case 'pr_merged':
    case 'pr_closed':
    case 'release_contains':
    case 'ci_green':
      return check.repo;
    case 'command':
      return check.run;
    case 'attested':
      return check.what;
    case 'artifact_published':
    case 'wait_answered':
      return '';
  }
}
