// SPDX-License-Identifier: Apache-2.0
import type { Todo, TodoItem, TodoItemStatus } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { knownOr, type Known } from '@/shared/lib/openEnum';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Section } from '@/shared/ui/Screen';
import { checkText, currentItem, hookErrors, mostlyAttested, todoCount } from '../todo';
import './todo.css';

const TONES: Readonly<Record<Known<TodoItemStatus>, BadgeTone>> = {
  todo: 'neutral',
  doing: 'signal',
  done: 'success',
  drop_requested: 'warning',
  dropped: 'neutral',
};

export interface TodoViewProps {
  readonly id: string;
  readonly todo: Todo;
}

/**
 * A session's todo as its owner sees it (TeamCode's companion `TodoView`): the plan's reference, the counter, the item
 * in progress, every item in order with its state, end condition and last proof, and the Stop hook's errors.
 */
export function TodoView({ id, todo }: TodoViewProps): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const { done, total } = todoCount(todo);
  const current = currentItem(todo);
  const errors = hookErrors(todo);
  return (
    <Section label={t('sessions.todo.title')} id={id}>
      <div className="o-stack">
        <h3 className="o-label">{t('sessions.todo.reference')}</h3>
        <p className="st-todo-text">{todo.reference}</p>
      </div>
      <div className="o-stack">
        <p className="st-todo-count">
          <span
            aria-label={t('sessions.todo.counter', { done, total })}
          >{`${String(done)} / ${String(total)}`}</span>{' '}
          {todo.status === 'active' ? null : (
            <Badge tone={todo.status === 'done' ? 'success' : 'warning'}>
              {enumText('sessions.todo.status', todo.status)}
            </Badge>
          )}
        </p>
        <div className="st-todo-bar" aria-hidden="true">
          <span style={{ width: `${String(total === 0 ? 0 : (done / total) * 100)}%` }} />
        </div>
        {current === undefined ? null : (
          <p className="st-todo-text">{t('sessions.todo.current', { name: current.name })}</p>
        )}
        {mostlyAttested(todo) ? (
          <Banner tone="warning" tag={t('sessions.todo.warningTag')}>
            {t('sessions.todo.mostlyAttested')}
          </Banner>
        ) : null}
      </div>
      <ul className="o-card o-rows">
        {todo.items.map((item) => (
          <li key={item.id}>
            <TodoRow item={item} locale={i18n.language} />
          </li>
        ))}
      </ul>
      {errors.length === 0 ? null : (
        <div className="o-stack">
          <h3 className="o-label">{t('sessions.todo.hookErrors')}</h3>
          <ul className="o-rows">
            {errors.map((event, index) => (
              <li key={`${event.at}-${String(index)}`} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__meta">{formatAbsolute(event.at, i18n.language)}</span>
                  <span className="st-todo-text">{event.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function TodoRow({ item, locale }: { readonly item: TodoItem; readonly locale: string }): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  return (
    <div className={item.status === 'doing' ? 'o-row st-todo-current' : 'o-row'}>
      <Badge tone={knownOr(TONES, item.status, 'neutral')}>
        {enumText('sessions.todo.state', item.status)}
      </Badge>
      <span className="o-row__main o-stack">
        <span className="o-row__title">{item.name}</span>
        <span className="o-row__meta st-todo-text">{item.description}</span>
        <span className="o-row__meta st-todo-text">
          {t('sessions.todo.doneWhen', { text: item.doneWhen.text })}
        </span>
        <ul className="o-row__meta st-todo-checks">
          {item.doneWhen.checks.map((check, index) => (
            // The checks are frozen once the list is made: their place is their identity.
            <li key={index}>{checkText(check, t)}</li>
          ))}
        </ul>
        {item.dropReason === undefined ? null : (
          <span className="st-todo-text">{t('sessions.todo.dropReason', { reason: item.dropReason })}</span>
        )}
        {item.proof === undefined ? null : (
          <span className="st-todo-text">
            {t('sessions.todo.lastProof', {
              when: formatAbsolute(item.proof.at, locale),
              text: item.proof.text,
            })}
          </span>
        )}
        {item.origin === 'discovered' || item.unverified === true ? (
          <span className="st-todo-chips">
            {item.origin === 'discovered' ? <Badge>{t('sessions.todo.addedAlong')}</Badge> : null}
            {item.unverified === true ? <Badge tone="warning">{t('sessions.todo.notVerified')}</Badge> : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}
