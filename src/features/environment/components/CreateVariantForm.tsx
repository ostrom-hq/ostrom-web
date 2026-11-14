// SPDX-License-Identifier: Apache-2.0
import type { EnvironmentVariantCreate } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { Field } from './Field';
import { type Binding, BINDINGS, checkVariant, VALUE_MAX, VARIANT_NAME_MAX } from '../model';

export interface CreateVariantFormProps {
  readonly create: (body: EnvironmentVariantCreate, onDone: () => void) => void;
  readonly pending: boolean;
}

/** A variant for one variable: one value for everyone assigned, or each member's own given at assignment. */
export function CreateVariantForm({ create, pending }: CreateVariantFormProps): ReactElement {
  const { t } = useTranslation();
  const [variable, setVariable] = useState('');
  const [name, setName] = useState('');
  const [binding, setBinding] = useState<Binding>('shared');
  const [value, setValue] = useState('');
  const [tried, setTried] = useState(false);
  const bindingName = useId();
  const draft = { variable, name, binding, value };
  const checked = checkVariant(draft);
  const problem = 'problem' in checked ? checked.problem : undefined;
  const body = 'body' in checked ? checked.body : undefined;
  const typedVariable = variable.trim();
  return (
    <Section label={t('environment.create.title')}>
      <form
        className="o-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (body === undefined) return;
          create(body, () => {
            setVariable('');
            setName('');
            setBinding('shared');
            setValue('');
            setTried(false);
          });
        }}
      >
        <Field
          label={t('environment.create.variable')}
          mono
          maxLength={128}
          placeholder="GITHUB_TOKEN"
          hint={t('environment.create.variableHint')}
          value={variable}
          onChange={setVariable}
        />
        <Field
          label={t('environment.create.name')}
          maxLength={VARIANT_NAME_MAX}
          placeholder={t('environment.create.namePlaceholder')}
          hint={t('environment.create.nameHint')}
          value={name}
          onChange={setName}
        />
        <fieldset className="env-choices">
          <legend className="o-field-label">{t('environment.create.binding')}</legend>
          {BINDINGS.map((option) => (
            <div key={option} className="env-choice">
              <input
                id={`${bindingName}-${option}`}
                type="radio"
                name={bindingName}
                value={option}
                checked={binding === option}
                aria-describedby={`${bindingName}-${option}-hint`}
                onChange={() => {
                  setBinding(option);
                }}
              />
              <span>
                <label htmlFor={`${bindingName}-${option}`} className="env-choice__title">
                  {t(`environment.binding.${option}.title`)}
                </label>
                <span id={`${bindingName}-${option}-hint`} className="o-row__meta">
                  {t(`environment.binding.${option}.hint`)}
                </span>
              </span>
            </div>
          ))}
        </fieldset>
        {draft.binding === 'shared' ? (
          <Field
            label={t('environment.create.value')}
            secret
            mono
            maxLength={VALUE_MAX}
            hint={t('environment.create.valueHint')}
            value={value}
            onChange={setValue}
          />
        ) : null}
        {problem !== undefined && (tried || (problem === 'variable' && typedVariable !== '')) ? (
          <Banner tone="warning" tag={t('environment.problemTag')} live>
            {t(`environment.create.problem.${problem}`)}
          </Banner>
        ) : null}
        <div className="o-inline">
          <Button type="submit" disabled={pending}>
            {pending ? t('environment.saving') : t('environment.create.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
