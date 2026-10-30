import type { ButtonHTMLAttributes, ReactElement } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'icon';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
  /** `icon` is a square button: give it an `aria-label`. */
  readonly size?: ButtonSize;
}

/** Garnet (`primary`) means "a human is awaited": one per screen, never for a warning. */
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return <button {...rest} type={type} className={`o-btn o-btn--${variant} o-btn--${size}`} />;
}
