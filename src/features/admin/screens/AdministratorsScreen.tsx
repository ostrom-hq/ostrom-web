// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState } from '@/shared/ui/Screen';
import { AddAdminForm } from '../components/AddAdminForm';
import { AdminFrame } from '../components/AdminFrame';
import { AdminRow } from '../components/AdminRow';
import { isLastAdmin } from '../model';
import { useAddInstanceAdmin, useInstanceAdmins, useRemoveInstanceAdmin } from '../useAdmin';

/** Admin, Administrators: who administers the instance, add by verified e-mail, remove (never the last). */
export function AdministratorsScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <AdminFrame title={t('admin.administrators.title')} lead={t('admin.administrators.lead')}>
      <Administrators />
    </AdminFrame>
  );
}

/** Only mounted for an administrator of the instance: nothing is asked of the server before. */
function Administrators(): ReactElement {
  const { t } = useTranslation();
  const { admins, viewer, failure } = useInstanceAdmins();
  const add = useAddInstanceAdmin();
  const removal = useRemoveInstanceAdmin();
  return (
    <>
      <AddAdminForm add={add} />
      {removal.failure === undefined ? null : (
        <Banner tone="danger" tag={t('admin.administrators.errorTag')} live>
          {isLastAdmin(removal.failure) ? (
            t('admin.administrators.lastAdmin')
          ) : (
            <FailureText failure={removal.failure} />
          )}
        </Banner>
      )}
      <LoadState data={admins} failure={failure}>
        {(list) => (
          <section aria-labelledby="ad-people" className="o-stack">
            <h2 id="ad-people" className="o-label">
              {t('admin.administrators.list')}
            </h2>
            <ul className="o-card o-rows">
              {list.map((admin) => (
                <li key={admin.userId}>
                  <AdminRow
                    admin={admin}
                    // Never the last, and never oneself: the console would be left on a screen it can no longer use.
                    removable={list.length > 1 && admin.login !== viewer}
                    removing={removal.removing === admin.userId}
                    isViewer={admin.login !== undefined && admin.login === viewer}
                    onRemove={() => {
                      removal.remove(admin.userId);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </LoadState>
    </>
  );
}
