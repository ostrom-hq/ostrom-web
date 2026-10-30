// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '@/shared/api/apiClient';
import { Button } from '@/shared/ui/Button';
import { CopyField } from '@/shared/ui/CopyField';
import { currentStep, type SetupStepId } from '../model';
import type { SetupViewModel } from '../useOnboarding';

/** Where each step is done in the console. */
function actionOf(id: SetupStepId, label: string): ReactNode {
  switch (id) {
    case 'github':
      // GitHub's install page, then back to the console through the server's callback.
      return (
        <a className="o-btn o-btn--secondary o-btn--md" href={apiUrl('/api/v1/github/app/install/start')}>
          {label}
        </a>
      );
    case 'team':
      return (
        <Link to="/members" className="o-btn o-btn--secondary o-btn--md">
          {label}
        </Link>
      );
    case 'accounts':
      return (
        <Link to="/accounts" className="o-btn o-btn--secondary o-btn--md">
          {label}
        </Link>
      );
    case 'rules':
      return (
        <Link to="/workflows" className="o-btn o-btn--secondary o-btn--md">
          {label}
        </Link>
      );
    case 'org':
    case 'cli':
      return null;
  }
}

/** The steps from a new organization to a first protected change, the next one open, each done where it says. */
export function SetupGuide({ setup }: { readonly setup: SetupViewModel }): ReactElement {
  const { t } = useTranslation();
  const open = currentStep(setup.steps);
  return (
    <section className="o-card o-section o-setup" aria-labelledby="setup-title">
      <div className="o-setup__head">
        <h2 id="setup-title" className="o-label">
          {t('onboarding.guide.title')}
        </h2>
        <span className="o-row__meta">
          {t('onboarding.guide.progress', { done: setup.done, total: setup.steps.length })}
        </span>
        <progress className="o-setup__bar" max={setup.steps.length} value={setup.done}>
          {setup.done}
        </progress>
      </div>
      <ol className="o-setup__steps">
        {setup.steps.map((step, index) => (
          <li
            key={step.id}
            className={`o-setup__step o-setup__step--${step.state}`}
            aria-current={step.id === open ? 'step' : undefined}
          >
            <span className="o-setup__mark" aria-hidden="true">
              {step.state === 'done' ? '✓' : String(index + 1)}
            </span>
            <span className="o-setup__body">
              <span className="o-row__title">
                {t(`onboarding.steps.${step.id}.title`)}
                {step.state === 'done' ? (
                  <span className="o-visually-hidden"> {t('onboarding.guide.done')}</span>
                ) : null}
              </span>
              <span className="o-row__meta">{t(`onboarding.steps.${step.id}.body`)}</span>
              {step.id === 'cli' ? (
                <span className="o-stack o-setup__cli">
                  <CopyField
                    label={t('onboarding.cli.login')}
                    value={`ostrom login --server ${setup.server}`}
                  />
                  <CopyField label={t('onboarding.cli.init')} value="ostrom init" />
                  <CopyField label={t('onboarding.cli.run')} value="ostrom claude" />
                  <a
                    className="o-row__meta"
                    href="https://ostrom.run/docs/install"
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t('onboarding.cli.install')}
                  </a>
                </span>
              ) : null}
            </span>
            <span className="o-setup__action">
              {actionOf(step.id, t(`onboarding.steps.${step.id}.action`))}
            </span>
          </li>
        ))}
      </ol>
      <div>
        <Button variant="ghost" onClick={setup.hide}>
          {t('onboarding.guide.hide')}
        </Button>
      </div>
    </section>
  );
}
