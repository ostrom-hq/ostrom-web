// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';

export interface AvatarProps {
  readonly login: string | undefined;
  readonly size?: number;
}

function initialsOf(login: string): string {
  const letters = login
    .split(/[-_.\s]+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  return letters.length > 0 ? letters.toUpperCase() : '?';
}

/** Initials only: no third-party image request from a page that shows who asked for what. */
export function Avatar({ login, size = 28 }: AvatarProps): ReactElement {
  return (
    <span
      className="o-avatar"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {login === undefined ? '?' : initialsOf(login)}
    </span>
  );
}
