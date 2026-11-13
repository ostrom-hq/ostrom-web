// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCountdown, remainingMs } from '../model';
import { useClock } from '../useConfirmation';

export interface CountdownProps {
  readonly expiresAt: string;
  /** Runs once when the time left reaches zero on this device. */
  readonly onElapsed: () => void;
}

/**
 * "expires in 12:34", ticking every second on its own: the page around it, and its before/after, never re-render
 * for it. This device's clock only counts down; whether it expired is the server's to say (a fast clock must not
 * hide a confirmation that still waits).
 */
export function Countdown({ expiresAt, onElapsed }: CountdownProps): ReactElement {
  const { t } = useTranslation();
  const left = remainingMs(expiresAt, useClock());
  const elapsed = left === 0;
  useEffect(() => {
    if (elapsed) onElapsed();
  }, [elapsed, onElapsed]);
  return (
    <time dateTime={expiresAt} className="cf-countdown">
      {t('confirm.expiresIn', { left: formatCountdown(left) })}
    </time>
  );
}
