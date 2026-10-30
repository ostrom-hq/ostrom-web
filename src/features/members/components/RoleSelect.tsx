// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrgRole } from '@/shared/org/roles';

export interface RoleSelectProps {
  readonly label: string;
  readonly roles: readonly OrgRole[];
  readonly value: OrgRole;
  readonly onChange: (role: OrgRole) => void;
}

/** A role among those the viewer can give: an invitation never makes an owner, the server refuses it. */
export function RoleSelect({ label, roles, value, onChange }: RoleSelectProps): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="o-field-label">
        {label}
      </label>
      <select
        id={id}
        className="o-input o-select"
        value={value}
        onChange={(event) => {
          const chosen = roles.find((role) => role === event.target.value);
          if (chosen !== undefined) onChange(chosen);
        }}
      >
        {roles.map((option) => (
          <option key={option} value={option}>
            {t(`members.role.${option}`)}
          </option>
        ))}
      </select>
    </>
  );
}
