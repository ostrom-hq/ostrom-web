// SPDX-License-Identifier: AGPL-3.0-only
import type { Wait, WaitField } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import {
  actionsOf,
  answerFor,
  type Answer,
  type Draft,
  type Drafts,
  draftsOf,
  type FieldProblem,
  OTHER_LIMIT,
  type Problems,
  styleOf,
  TEXT_LIMIT,
  valueTypeOf,
  without,
} from '../model';

export interface WaitFormProps {
  readonly wait: Wait;
  readonly sending: boolean;
  readonly onAnswer: (answer: Answer) => void;
}

/** The fields of a wait as inputs, and its actions as buttons: nothing is sent before the answer is well-formed. */
export function WaitForm({ wait, sending, onAnswer }: WaitFormProps): ReactElement {
  const { t } = useTranslation();
  const { fields = [] } = wait.question;
  const [drafts, setDrafts] = useState<Drafts>(() => draftsOf(fields));
  const [problems, setProblems] = useState<Problems>({});
  const prefix = useId();
  const change = (field: WaitField, draft: Draft): void => {
    setDrafts((previous) => ({ ...previous, [field.id]: draft }));
    setProblems((previous) => without(previous, field.id));
  };
  return (
    <form
      className="wt-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
      aria-label={t('waits.detail.form')}
    >
      {fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          draft={drafts[field.id]}
          problem={problems[field.id]}
          id={`${prefix}-${field.id}`}
          onChange={(draft) => {
            change(field, draft);
          }}
        />
      ))}
      <div className="o-inline">
        {actionsOf(wait, t('waits.detail.done')).map((action) => (
          <Button
            key={action.id}
            variant={styleOf(action)}
            disabled={sending}
            onClick={() => {
              const checked = answerFor(fields, drafts, action);
              if ('problems' in checked) setProblems(checked.problems);
              else {
                setProblems({});
                onAnswer(checked.answer);
              }
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </form>
  );
}

interface FieldInputProps {
  readonly field: WaitField;
  readonly draft: Draft | undefined;
  readonly problem: FieldProblem | undefined;
  readonly id: string;
  readonly onChange: (draft: Draft) => void;
}

const BLANK: Draft = { text: '', picked: [], other: '' };

function FieldInput({ field, draft = BLANK, problem, id, onChange }: FieldInputProps): ReactElement {
  const { t } = useTranslation();
  const type = valueTypeOf(field);
  const helpId = `${id}-help`;
  const problemId = `${id}-problem`;
  const label = (
    <>
      {field.label}
      {field.required === true ? <span aria-hidden="true"> *</span> : null}
    </>
  );
  const help =
    field.help === undefined ? null : (
      <p id={helpId} className="wt-help">
        {field.help}
      </p>
    );
  const describedBy = [
    field.help === undefined ? undefined : helpId,
    problem === undefined ? undefined : problemId,
  ]
    .filter((part) => part !== undefined)
    .join(' ');
  const aria = {
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': problem === undefined ? undefined : true,
    'aria-required': field.required === true ? true : undefined,
  } as const;
  const warning =
    problem === undefined ? null : (
      <p id={problemId} className="wt-problem" role="alert">
        {t(`waits.problem.${problem}`, { max: field.maxLength ?? TEXT_LIMIT, other: OTHER_LIMIT })}
      </p>
    );

  if (type === undefined) {
    // `info` shows its help and takes nothing; a type this screen cannot fill (file, secret) says where it is filled.
    return (
      <div className="wt-field">
        <p className="o-field-label">{field.label}</p>
        {field.type === 'info' ? (
          help
        ) : (
          <p className="wt-help">{t('waits.field.elsewhere', { type: field.type })}</p>
        )}
      </div>
    );
  }
  if (type === 'confirm') {
    return (
      <fieldset className="wt-field" aria-describedby={aria['aria-describedby']}>
        <legend className="o-field-label">{label}</legend>
        {help}
        <div className="o-inline">
          {(['true', 'false'] as const).map((value) => (
            <label key={value} className="wt-check">
              <input
                type="radio"
                name={id}
                value={value}
                checked={draft.text === value}
                onChange={() => {
                  onChange({ ...draft, text: value });
                }}
              />
              {t(value === 'true' ? 'waits.field.yes' : 'waits.field.no')}
            </label>
          ))}
        </div>
        {warning}
      </fieldset>
    );
  }
  if (type === 'choice') {
    const { options = [] } = field;
    const multiple = field.multiple === true;
    return (
      <fieldset className="wt-field" aria-describedby={aria['aria-describedby']}>
        <legend className="o-field-label">{label}</legend>
        {help}
        <div className="wt-options">
          {options.map((option) => (
            <label key={option} className="wt-check">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={id}
                value={option}
                checked={draft.picked.includes(option)}
                onChange={() => {
                  if (multiple) {
                    onChange({
                      ...draft,
                      picked: draft.picked.includes(option)
                        ? draft.picked.filter((item) => item !== option)
                        : [...draft.picked, option],
                    });
                  } else onChange({ ...draft, picked: [option], other: '' });
                }}
              />
              {option}
            </label>
          ))}
        </div>
        {field.allowOther === true ? (
          <div className="wt-field">
            <label htmlFor={`${id}-other`} className="o-field-label">
              {t('waits.field.other')}
            </label>
            <input
              id={`${id}-other`}
              className="o-input"
              type="text"
              value={draft.other}
              onChange={(event) => {
                onChange({ ...draft, picked: multiple ? draft.picked : [], other: event.target.value });
              }}
            />
          </div>
        ) : null}
        {warning}
      </fieldset>
    );
  }
  const inputProps = {
    id,
    className: 'o-input',
    value: draft.text,
    ...aria,
  } as const;
  return (
    <div className="wt-field">
      <label htmlFor={id} className="o-field-label">
        {label}
      </label>
      {help}
      {type === 'text' && (field.maxLength === undefined || field.maxLength > 200) ? (
        <textarea
          {...inputProps}
          rows={4}
          onChange={(event) => {
            onChange({ ...draft, text: event.target.value });
          }}
        />
      ) : (
        <input
          {...inputProps}
          type={type === 'date' ? 'date' : 'text'}
          inputMode={type === 'number' ? 'decimal' : undefined}
          onChange={(event) => {
            onChange({ ...draft, text: event.target.value });
          }}
        />
      )}
      {warning}
    </div>
  );
}
