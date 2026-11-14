// SPDX-License-Identifier: Apache-2.0
import type { InstanceAdmin } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { adminName } from '../model';

export interface AdminRowProps {
  readonly admin: InstanceAdmin;
  /** The last administrator is never removed: the server refuses, so the console does not offer it. */
  readonly removable: boolean;
  readonly removing: boolean;
  readonly isViewer: boolean;
  readonly onRemove: () => void;
}

/** One administrator: who, how they became one, and the way to remove them. */
export function AdminRow({ admin, removable, removing, isViewer, onRemove }: AdminRowProps): ReactElement {
  const { t } = useTranslation();
  const enumText = useEnumLabel();
  const name = adminName(admin);
  return (
    <div className="o-row">
      <Avatar login={name} size={36} />
      <span className="o-row__main">
        <span className="o-row__title">
          {name}
          {isViewer ? <span className="o-row__meta"> {t('admin.administrators.you')}</span> : null}
        </span>
        {admin.email === undefined ? null : <span className="o-row__meta">{admin.email}</span>}
      </span>
      <span className="o-row__end o-inline">
        <Badge>{enumText('admin.administrators.source', admin.source)}</Badge>
        {removable ? (
          <ConfirmButton
            label={t('admin.administrators.remove')}
            confirm={t('admin.administrators.removeConfirm', { name })}
            keep={t('admin.administrators.keep')}
            disabled={removing}
            onConfirm={onRemove}
          />
        ) : null}
      </span>
    </div>
  );
}
