// SPDX-License-Identifier: AGPL-3.0-only
import type { Todo, TodoCheck, TodoItem } from '@gen/api/types.gen';
import { i18n } from '@/shared/i18n/i18n';
import {
  checkDetail,
  checkText,
  countedItems,
  currentItem,
  hookErrors,
  isFinished,
  mostlyAttested,
  todoCount,
} from './todo';

function item(id: string, status: TodoItem['status'], more: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    name: id,
    description: id,
    doneWhen: { text: id, checks: [{ type: 'pr_merged', repo: 'acme/web' }] },
    origin: 'plan',
    status,
    ...more,
  };
}

function todo(items: TodoItem[], more: Partial<Todo> = {}): Todo {
  return {
    id: 't',
    sessionId: 's',
    reference: 'plan',
    status: 'active',
    items,
    createdAt: '2026-10-30T07:00:00.000Z',
    updatedAt: '2026-10-30T07:00:00.000Z',
    ...more,
  };
}

describe('the counter', () => {
  it('counts what is done of what is left, never a dropped item', () => {
    const list = todo([
      item('a', 'done'),
      item('b', 'doing'),
      item('c', 'dropped'),
      item('d', 'drop_requested'),
      item('e', 'todo'),
    ]);
    expect(countedItems(list).map((entry) => entry.id)).toEqual(['a', 'b', 'd', 'e']);
    expect(todoCount(list)).toEqual({ done: 1, total: 4 });
  });

  it('is 0 / 0 for a list of nothing but dropped items', () => {
    expect(todoCount(todo([item('a', 'dropped')]))).toEqual({ done: 0, total: 0 });
    expect(isFinished(todo([item('a', 'dropped')]))).toBe(false);
  });

  it('is finished when the list is done, or when every counted item is', () => {
    expect(isFinished(todo([item('a', 'doing')], { status: 'done' }))).toBe(true);
    expect(isFinished(todo([item('a', 'done'), item('b', 'dropped')]))).toBe(true);
    expect(isFinished(todo([item('a', 'done'), item('b', 'todo')]))).toBe(false);
  });
});

describe('the item in progress', () => {
  it('is the one doing, if any', () => {
    expect(currentItem(todo([item('a', 'done'), item('b', 'doing')]))?.id).toBe('b');
    expect(currentItem(todo([item('a', 'todo')]))).toBeUndefined();
  });
});

describe('the warning about the agent’s word', () => {
  const unverified = { unverified: true };
  it('needs more than a third of the counted items, and at least three of them', () => {
    expect(mostlyAttested(todo([item('a', 'done', unverified), item('b', 'todo')]))).toBe(false);
    expect(mostlyAttested(todo([item('a', 'done', unverified), item('b', 'todo'), item('c', 'todo')]))).toBe(
      false,
    );
    expect(
      mostlyAttested(todo([item('a', 'done', unverified), item('b', 'todo', unverified), item('c', 'todo')])),
    ).toBe(true);
  });

  it('leaves out a dropped item', () => {
    expect(
      mostlyAttested(
        todo([
          item('a', 'done', unverified),
          item('b', 'dropped', unverified),
          item('c', 'todo'),
          item('d', 'todo'),
          item('e', 'todo'),
        ]),
      ),
    ).toBe(false);
  });
});

describe('the Stop hook errors', () => {
  const events = (count: number): Todo['hookEvents'] =>
    Array.from({ length: count }, (_, index) => ({
      at: `2026-10-30T07:0${String(index)}:00.000Z`,
      kind: 'hook_error' as const,
      text: `error ${String(index)}`,
    }));

  it('keeps the newest three hook errors, and no blocked stop', () => {
    const list = todo([], {
      hookEvents: [
        ...(events(5) ?? []),
        { at: '2026-10-30T08:00:00.000Z', kind: 'blocked', text: 'Blocked' },
      ],
    });
    expect(hookErrors(list).map((event) => event.text)).toEqual(['error 2', 'error 3', 'error 4']);
  });

  it('reads a list that recorded none', () => {
    expect(hookErrors(todo([]))).toEqual([]);
  });
});

describe('what a check looks at', () => {
  it.each<[TodoCheck, string]>([
    [{ type: 'pr_merged', repo: 'acme/web' }, 'acme/web'],
    [{ type: 'pr_closed', repo: 'acme/api', reason: 'superseded' }, 'acme/api (superseded)'],
    [{ type: 'release_contains', repo: 'acme/cli' }, 'acme/cli'],
    [{ type: 'ci_green', repo: 'acme/app' }, 'acme/app'],
    [{ type: 'command', run: 'make test' }, 'make test'],
    [{ type: 'attested', what: 'I looked' }, 'I looked'],
    [{ type: 'artifact_published' }, ''],
    [{ type: 'wait_answered' }, ''],
  ])('%j reads %j', (check, detail) => {
    expect(checkDetail(check)).toBe(detail);
  });
});

describe('a check in words', () => {
  const t = i18n.getFixedT('en');
  it('uses the wording of a type it knows', () => {
    expect(checkText({ type: 'command', run: 'make' }, t)).toBe('Command: make');
  });
  it('shows a type a newer server added as its name', () => {
    expect(checkText({ type: 'review_approved' }, t)).toBe('review_approved');
  });
});
