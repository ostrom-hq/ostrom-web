// SPDX-License-Identifier: Apache-2.0
import type { ForecastSnapshotResponse } from '@gen/api/types.gen';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactElement, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { WindowCard } from '../components/WindowCard';
import { accountOptionOf } from '../model';
import { useForecasts } from '../useForecasts';
import '../forecasts.css';

/**
 * TeamCode's Forecasts page: how fast each window of a shared subscription fills up, and when it would reach the
 * account's ceiling. Owners and admins only.
 */
export function ForecastsScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('forecasts.title')}>
      {(_org, role) => (managesMembers(role) ? <Forecasts /> : <AdminsOnly />)}
    </WithOrg>
  );
}

function AdminsOnly(): ReactElement {
  const { t } = useTranslation();
  return (
    <Screen title={t('forecasts.title')}>
      <EmptyState title={t('forecasts.adminsOnlyTitle')}>{t('forecasts.adminsOnly')}</EmptyState>
    </Screen>
  );
}

function Forecasts(): ReactElement {
  const { t } = useTranslation();
  const { account } = useSearch({ from: '/forecasts' });
  const view = useForecasts(account);
  if (view.forbidden) return <AdminsOnly />;
  return (
    <Screen title={t('forecasts.title')} lead={t('forecasts.lead')}>
      <div className="fc-controls">
        {view.snapshot === undefined ? null : <AccountPicker snapshot={view.snapshot} />}
        <p className="fc-live" role="status">
          {view.paused ? t('forecasts.live.paused') : t('forecasts.live.on')}
        </p>
        <Button variant="secondary" onClick={view.togglePaused}>
          {view.paused ? t('forecasts.live.resume') : t('forecasts.live.pause')}
        </Button>
        <Button variant="secondary" onClick={view.refresh}>
          {t('forecasts.live.refresh')}
        </Button>
      </div>
      {view.notFound ? (
        <EmptyState title={t('forecasts.notFoundTitle')}>
          {t('forecasts.notFound')} <Link to="/forecasts">{t('forecasts.first')}</Link>
        </EmptyState>
      ) : (
        <LoadState data={view.snapshot} failure={view.failure}>
          {(snapshot) => <SnapshotView snapshot={snapshot} />}
        </LoadState>
      )}
    </Screen>
  );
}

function AccountPicker({ snapshot }: { readonly snapshot: ForecastSnapshotResponse }): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const navigate = useNavigate({ from: '/forecasts' });
  return (
    <div className="fc-picker">
      <label htmlFor={id}>{t('forecasts.account')}</label>
      <select
        id={id}
        className="o-input o-select"
        value={snapshot.account?.id ?? ''}
        disabled={snapshot.accounts.length === 0}
        onChange={(event) => {
          void navigate({ search: { account: event.currentTarget.value } });
        }}
      >
        {snapshot.accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {accountOptionOf(account)}
          </option>
        ))}
      </select>
    </div>
  );
}

function SnapshotView({ snapshot }: { readonly snapshot: ForecastSnapshotResponse }): ReactElement {
  const { t, i18n } = useTranslation();
  const selected = snapshot.account;
  if (selected === undefined || selected === null) {
    return <EmptyState title={t('forecasts.noAccountsTitle')}>{t('forecasts.noAccounts')}</EmptyState>;
  }
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 1 });
  return (
    <div className="o-stack">
      <p className="o-screen__lead">
        {t('forecasts.snapshot', {
          when: formatAbsolute(snapshot.generatedAt, i18n.language),
          provider: selected.provider,
          status: selected.status,
        })}
        {selected.paused ? ` · ${t('forecasts.paused')}` : null}
      </p>
      <details className="o-card fc-help">
        <summary>{t('forecasts.help.summary')}</summary>
        <p>{t('forecasts.help.lines')}</p>
        <p>{t('forecasts.help.threshold', { value: percent.format(snapshot.pressureThreshold) })}</p>
      </details>
      {snapshot.truncated ? (
        <Banner tone="warning" tag={t('forecasts.truncatedTag')}>
          {t('forecasts.truncated')}
        </Banner>
      ) : null}
      {snapshot.windows.length === 0 ? (
        <EmptyState title={t('forecasts.noWindowsTitle')}>{t('forecasts.noWindows')}</EmptyState>
      ) : (
        snapshot.windows.map((window) => (
          <WindowCard
            key={window.window}
            window={window}
            now={snapshot.generatedAt}
            threshold={snapshot.pressureThreshold}
          />
        ))
      )}
    </div>
  );
}
