// SPDX-License-Identifier: Apache-2.0
import type { ApiPriceDto, ApiPriceTableDto } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  draftPrice,
  formatPrice,
  priceDraftOf,
  MAX_MODEL_LENGTH,
  PRICE_KINDS,
  PRICE_PROVIDERS,
  type PriceDraft,
  type PriceKind,
  sortPrices,
  utcDay,
  withoutPrice,
  withPrice,
} from '../prices';
import { type ApiPricesViewModel, useApiPrices } from '../useApiPrices';

/**
 * TeamCode's API price editor: the dated rows the gateway prices the organization's model calls with, a form that adds
 * or replaces a row, a removal per row, and Anthropic's list prices to load. Owners and admins only, and only where
 * the server serves it (`capacity.apiprices.v1`). A write needs a sign-in less than five minutes old.
 */
export function ApiPricesSection({ manages }: { readonly manages: boolean }): ReactElement | null {
  const { t } = useTranslation();
  const shown = useAnnounced('capacity.apiprices.v1') && manages;
  const view = useApiPrices(shown);
  // The row whose prices the form was filled with ("Edit"); none: a new row.
  const [editing, setEditing] = useState<ApiPriceDto | undefined>(undefined);
  if (!shown) return null;
  return (
    <Section label={t('policy.prices.title')}>
      <p className="o-row__meta">{t('policy.prices.lead')}</p>
      <LoadState data={view.table} failure={view.failure} rows={3}>
        {(table) => (
          <>
            {table.defaults === true ? (
              <Banner tag={t('policy.prices.defaultsTag')}>{t('policy.prices.defaults')}</Banner>
            ) : null}
            <PriceTable table={table} view={view} edit={setEditing} />
            {view.saveFailure === undefined ? null : (
              <Banner tone="danger" tag={t('policy.errorTag')} live>
                <FailureText failure={view.saveFailure} />
              </Banner>
            )}
            <PriceForm
              key={editing === undefined ? '' : rowKey(editing)}
              table={table}
              view={view}
              from={editing}
              onSaved={() => {
                // The next Edit, even of the same row, fills the form again.
                setEditing(undefined);
              }}
            />
            <div className="o-stack">
              <h3 className="o-label">{t('policy.prices.loadTitle')}</h3>
              <p className="o-row__meta">{t('policy.prices.loadLead')}</p>
              <div className="o-inline">
                <Button variant="secondary" disabled={view.saving} onClick={view.loadDefaults}>
                  {t('policy.prices.load')}
                </Button>
              </div>
            </div>
          </>
        )}
      </LoadState>
    </Section>
  );
}

function rowKey(row: ApiPriceDto): string {
  return `${row.provider}:${row.model}:${row.effectiveFrom}`;
}

function PriceTable({
  table,
  view,
  edit,
}: {
  readonly table: ApiPriceTableDto;
  readonly view: ApiPricesViewModel;
  readonly edit: (row: ApiPriceDto) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  if (table.prices.length === 0) return <p className="o-empty">{t('policy.prices.empty')}</p>;
  // A list rather than a table: eight columns do not fit a phone, and a box that scrolls sideways widens its page.
  return (
    <ul className="o-card o-rows" aria-label={t('policy.prices.caption')}>
      {sortPrices(table.prices).map((row) => (
        <li key={rowKey(row)} className="o-row">
          <span className="o-row__main">
            <span className="o-row__title o-mono">{row.model}</span>
            <span className="o-row__meta">
              {t('policy.prices.rowMeta', { provider: row.provider, from: row.effectiveFrom })}
            </span>
            <span className="o-row__meta pl-figures">
              {PRICE_KINDS.map(
                (kind) => `${t(`policy.prices.kind.${kind}`)} ${formatPrice(row[kind], i18n.language)}`,
              ).join(' · ')}
            </span>
          </span>
          <span className="o-inline">
            <Button
              variant="ghost"
              aria-label={t('policy.prices.editRow', { model: row.model, from: row.effectiveFrom })}
              onClick={() => {
                edit(row);
              }}
            >
              {t('policy.prices.edit')}
            </Button>
            {table.defaults === true ? null : (
              <Button
                variant="ghost"
                disabled={view.saving}
                aria-label={t('policy.prices.removeRow', { model: row.model, from: row.effectiveFrom })}
                onClick={() => {
                  view.save(withoutPrice(table.prices, row), () => undefined);
                }}
              >
                {t('policy.prices.remove')}
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const EMPTY_PRICES: Pick<PriceDraft, PriceKind> = {
  inputMicros: '',
  cacheWriteMicros: '',
  cacheReadMicros: '',
  outputMicros: '',
};

function PriceForm({
  table,
  view,
  from,
  onSaved,
}: {
  readonly table: ApiPriceTableDto;
  readonly view: ApiPricesViewModel;
  readonly from: ApiPriceDto | undefined;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PriceDraft>(() =>
    from === undefined
      ? { provider: 'anthropic', model: '', effectiveFrom: utcDay(new Date()), ...EMPTY_PRICES }
      : priceDraftOf(from),
  );
  const ids = {
    provider: useId(),
    model: useId(),
    from: useId(),
    inputMicros: useId(),
    cacheWriteMicros: useId(),
    cacheReadMicros: useId(),
    outputMicros: useId(),
  };
  const row: ApiPriceDto | undefined = draftPrice(draft);
  const set = (field: keyof PriceDraft) => (event: { readonly target: { readonly value: string } }) => {
    setDraft((was) => ({ ...was, [field]: event.target.value }));
  };
  return (
    <form
      className="o-stack"
      aria-label={t('policy.prices.add')}
      onSubmit={(event) => {
        event.preventDefault();
        if (row !== undefined)
          view.save(withPrice(table.prices, row), () => {
            setDraft((was) => ({ ...was, model: '', ...EMPTY_PRICES }));
            onSaved();
          });
      }}
    >
      <h3 className="o-label">{t('policy.prices.add')}</h3>
      <p className="o-row__meta">{t('policy.prices.addHelp')}</p>
      <div className="pl-price-form">
        <div className="o-stack">
          <label htmlFor={ids.provider} className="o-field-label">
            {t('policy.prices.provider')}
          </label>
          <select
            id={ids.provider}
            className="o-input o-select"
            value={draft.provider}
            onChange={set('provider')}
          >
            {PRICE_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </div>
        <div className="o-stack">
          <label htmlFor={ids.model} className="o-field-label">
            {t('policy.prices.modelField')}
          </label>
          <input
            id={ids.model}
            className="o-input o-mono"
            placeholder="claude-sonnet-4"
            maxLength={MAX_MODEL_LENGTH}
            autoComplete="off"
            value={draft.model}
            onChange={set('model')}
          />
        </div>
        <div className="o-stack">
          <label htmlFor={ids.from} className="o-field-label">
            {t('policy.prices.fromField')}
          </label>
          <input
            id={ids.from}
            className="o-input"
            type="date"
            value={draft.effectiveFrom}
            onChange={set('effectiveFrom')}
          />
        </div>
        {PRICE_KINDS.map((kind) => (
          <div key={kind} className="o-stack">
            <label htmlFor={ids[kind]} className="o-field-label">
              {t(`policy.prices.field.${kind}`)}
            </label>
            <input
              id={ids[kind]}
              className="o-input"
              inputMode="decimal"
              autoComplete="off"
              value={draft[kind]}
              onChange={set(kind)}
            />
          </div>
        ))}
      </div>
      <div className="o-inline">
        <Button type="submit" disabled={view.saving || row === undefined}>
          {view.saving ? t('policy.prices.saving') : t('policy.prices.save')}
        </Button>
      </div>
    </form>
  );
}
