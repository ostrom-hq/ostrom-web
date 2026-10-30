import type { ButtonHTMLAttributes, ReactElement } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
}

/** Garnet (`primary`) means "a human is awaited": one per screen, never for a warning. */
export function Button({ variant = 'secondary', type = 'button', ...rest }: ButtonProps): ReactElement {
  return <button {...rest} type={type} className={`o-btn o-btn--${variant}`} />;
}
