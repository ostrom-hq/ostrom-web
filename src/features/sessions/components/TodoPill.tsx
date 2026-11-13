// SPDX-License-Identifier: AGPL-3.0-only
import type { Todo } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { isFinished, todoCount } from '../todo';
import './todo.css';

export interface TodoPillProps {
  readonly todo: Todo;
  /** The Todo view is open. */
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The id of the view the pill opens. */
  readonly controls: string;
}

/** The counter of the session's todo, "4 / 9": it opens (and closes) the Todo view. */
export function TodoPill({ todo, open, onToggle, controls }: TodoPillProps): ReactElement {
  const { t } = useTranslation();
  const { done, total } = todoCount(todo);
  return (
    <button
      type="button"
      className="st-todo-pill o-btn"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={t('sessions.todo.pill', { done, total })}
      onClick={onToggle}
    >
      <Badge tone={isFinished(todo) ? 'success' : 'neutral'}>{`${String(done)} / ${String(total)}`}</Badge>
      {t('sessions.todo.title')}
    </button>
  );
}
