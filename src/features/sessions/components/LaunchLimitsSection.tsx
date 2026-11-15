// SPDX-License-Identifier: Apache-2.0
import type { LaunchLimits } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import type { OrgRole } from '@/shared/org/roles';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { Section } from '@/shared/ui/Screen';
import { budgetDraftOf, budgetMicrosOf, launchConcurrencyOf, MAX_LAUNCH_CONCURRENCY } from '../model';
import { useLaunchLimits } from '../useLaunchLimits';

export interface LaunchLimitsSectionProps {
  readonly launchId: string | undefined;
  readonly role: OrgRole | undefined;
}

/**
 * TeamCode's run policy on a launch, for an administrator: the budget it may spend (0 for none), the calls it runs at
 * once (0 for no limit) and a pause that refuses its next model calls. Nothing shows where the server has no limits
 * or the viewer does not administer the organization.
 */
export function LaunchLimitsSection({ launchId, role }: LaunchLimitsSectionProps): ReactElement | null {
  const view = useLaunchLimits(launchId, role);
  if (view.limits === undefined) return null;
  // Written again when the server's limits change (a save, another administrator): the form starts from them.
  const { budgetMicros, maxConcurrent, paused } = view.limits;
  return (
    <LimitsForm
      key={[budgetMicros, maxConcurrent, paused].map(String).join(':')}
      limits={view.limits}
      saving={view.saving}
      saved={view.saved}
      failure={view.failure}
      onSave={view.save}
    />
  );
}

interface LimitsFormProps {
  readonly limits: LaunchLimits;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly failure: Error | undefined;
  readonly onSave: (next: LaunchLimits) => void;
}

function LimitsForm({ limits, saving, saved, failure, onSave }: LimitsFormProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [budget, setBudget] = useState(budgetDraftOf(limits.budgetMicros));
  const [concurrent, setConcurrent] = useState(String(limits.maxConcurrent));
  const [paused, setPaused] = useState(limits.paused);
  const budgetId = useId();
  const concurrentId = useId();
  const hintId = useId();
  const micros = budgetMicrosOf(budget);
  const maxConcurrent = launchConcurrencyOf(concurrent);
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' });
  return (
    <Section label={t('sessions.limits.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (micros !== undefined && maxConcurrent !== undefined) {
            onSave({ budgetMicros: micros, maxConcurrent, paused });
          }
        }}
      >
        <p id={hintId} className="o-screen__lead">
          {t('sessions.limits.hint')}
        </p>
        <label htmlFor={budgetId} className="o-field-label">
          {t('sessions.limits.budget')}
        </label>
        <input
          id={budgetId}
          className="o-input"
          inputMode="decimal"
          value={budget}
          aria-invalid={micros === undefined}
          aria-describedby={hintId}
          onChange={(event) => {
            setBudget(event.target.value);
          }}
        />
        <label htmlFor={concurrentId} className="o-field-label">
          {t('sessions.limits.concurrent', { max: MAX_LAUNCH_CONCURRENCY })}
        </label>
        <input
          id={concurrentId}
          className="o-input"
          type="number"
          min={0}
          max={MAX_LAUNCH_CONCURRENCY}
          step={1}
          value={concurrent}
          aria-invalid={maxConcurrent === undefined}
          aria-describedby={hintId}
          onChange={(event) => {
            setConcurrent(event.target.value);
          }}
        />
        <label className="o-inline">
          <input
            type="checkbox"
            checked={paused}
            aria-describedby={hintId}
            onChange={(event) => {
              setPaused(event.target.checked);
            }}
          />
          {t('sessions.limits.paused')}
        </label>
        {limits.spentMicros === undefined ? null : (
          <p className="o-row__meta">
            {t('sessions.limits.spent', { amount: money.format(limits.spentMicros / 1_000_000) })}
          </p>
        )}
        <div className="o-inline">
          <Button type="submit" disabled={saving || micros === undefined || maxConcurrent === undefined}>
            {saving ? t('sessions.limits.saving') : t('sessions.limits.save')}
          </Button>
        </div>
      </form>
      {saved && failure === undefined ? (
        <Banner tone="info" tag={t('sessions.limits.savedTag')} live>
          {t('sessions.limits.savedBody')}
        </Banner>
      ) : null}
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('sessions.limits.errorTag')} live>
          <FailureText failure={failure} />
        </Banner>
      )}
    </Section>
  );
}
