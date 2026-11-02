// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useState } from 'react';
import { Button } from './Button';

export interface ConfirmButtonProps {
  /** The first button: "Remove", "Stop". */
  readonly label: string;
  /** The second button, which says exactly what goes away: "Remove linear". */
  readonly confirm: string;
  /** The way back: "Keep". */
  readonly keep: string;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
  /** `danger` (red) when something goes away; `secondary` when the second click writes rather than removes. */
  readonly tone?: 'danger' | 'secondary';
}

/** A gesture that cannot be undone takes two clicks; the second one names what it does. */
export function ConfirmButton({
  label,
  confirm,
  keep,
  disabled,
  onConfirm,
  tone = 'danger',
}: ConfirmButtonProps): ReactElement {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="o-inline">
      <Button
        variant={tone}
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirm}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setAsking(false);
        }}
      >
        {keep}
      </Button>
    </span>
  ) : (
    <Button
      variant={tone === 'danger' ? 'ghost' : 'secondary'}
      disabled={disabled}
      onClick={() => {
        setAsking(true);
      }}
    >
      {label}
    </Button>
  );
}
