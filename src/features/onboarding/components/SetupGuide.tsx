// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { CopyField } from '@/shared/ui/CopyField';
import { currentStep, type SetupStep } from '../model';
import type { SetupViewModel } from '../useOnboarding';

/** Where each step is done in the console; a step only an owner or an admin can do says so to anyone else. */
function actionOf(
  step: SetupStep,
  setup: SetupViewModel,
  label: string,
  words: { readonly onlyAdmins: string; readonly undo: string },
): ReactNode {
  const { onlyAdmins } = words;
  const button = 'o-btn o-btn--secondary o-btn--md';
  switch (step.id) {
    case 'github':
      // The GitHub screen says what the App does, then sends to GitHub's install page.
      return setup.manages ? (
        <Link to="/github" className={button}>
          {label}
        </Link>
      ) : (
        <span className="o-row__meta">{onlyAdmins}</span>
      );
    case 'team':
      return setup.manages ? (
        <Link to="/members" className={button}>
          {label}
        </Link>
      ) : (
        <span className="o-row__meta">{onlyAdmins}</span>
      );
    case 'accounts':
      return (
        <Link to="/accounts" className={button}>
          {label}
        </Link>
      );
    case 'rules':
      return (
        <Link to="/workflows" className={button}>
          {label}
        </Link>
      );
    case 'cli':
      // Nothing the console reads can tell: the person says so, and can take it back.
      return step.state === 'done' ? (
        <Button
          variant="ghost"
          onClick={() => {
            setup.cliDone(false);
          }}
        >
          {words.undo}
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setup.cliDone(true);
          }}
        >
          {label}
        </Button>
      );
    case 'org':
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
          {open === undefined
            ? t('onboarding.guide.complete', { total: setup.steps.length })
            : t('onboarding.guide.progress', { done: setup.done, total: setup.steps.length })}
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
                  <CopyField label={t('onboarding.cli.run')} value="ostrom run claude" />
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
              {actionOf(step, setup, t(`onboarding.steps.${step.id}.action`), {
                onlyAdmins: t('onboarding.guide.onlyAdmins'),
                undo: t('onboarding.steps.cli.undo'),
              })}
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
