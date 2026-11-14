// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';

export interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly type?: 'text' | 'number' | 'password' | 'url';
  /** A text area for a list or a PEM bundle. */
  readonly rows?: number;
  readonly hint?: string;
  readonly maxLength?: number;
}

/** A labelled text, number or secret field; a field with `rows` is a text area. */
export function Field({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text',
  rows,
  hint,
  maxLength,
}: FieldProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const common = {
    id,
    className: 'o-input',
    value,
    disabled,
    autoComplete: 'off',
    'aria-describedby': hint === undefined ? undefined : hintId,
    ...(maxLength === undefined ? {} : { maxLength }),
  };
  return (
    <div className="o-stack">
      <label htmlFor={id} className="o-field-label">
        {label}
      </label>
      {rows === undefined ? (
        <input
          {...common}
          type={type}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <textarea
          {...common}
          rows={rows}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
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
  readonly disabled?: boolean;
}

/** A labelled select. */
export function Choice({ label, value, options, onChange, disabled = false }: ChoiceProps): ReactElement {
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
        disabled={disabled}
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
