// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';

export interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** A value is a password field: never shown, never offered by the browser's autofill. */
  readonly secret?: boolean;
  readonly mono?: boolean;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly maxLength: number;
}

/** A labelled text field, its hint read with it. */
export function Field({
  label,
  value,
  onChange,
  secret = false,
  mono = false,
  placeholder,
  hint,
  maxLength,
}: FieldProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="o-stack">
      <label htmlFor={id} className="o-field-label">
        {label}
      </label>
      <input
        id={id}
        className={mono ? 'o-input o-mono' : 'o-input'}
        type={secret ? 'password' : 'text'}
        autoComplete={secret ? 'new-password' : 'off'}
        spellCheck={false}
        value={value}
        aria-describedby={hint === undefined ? undefined : hintId}
        {...(placeholder === undefined ? {} : { placeholder })}
        maxLength={maxLength}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="o-row__meta">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface ChoiceProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}

/** A labelled select. */
export function Choice({ label, value, options, onChange }: ChoiceProps): ReactElement {
  const id = useId();
  return (
    <div className="o-stack">
      <label htmlFor={id} className="o-field-label">
        {label}
      </label>
      <select
        id={id}
        className="o-input o-select"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
