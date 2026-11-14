// SPDX-License-Identifier: Apache-2.0
import type { EnvironmentVariant } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { bindingOf, isNonEmpty, type MemberEnvironment, type NonEmpty, VALUE_MAX } from '../model';
import { Choice, Field } from './Field';

export interface AssignFormProps {
  readonly members: readonly MemberEnvironment[];
  readonly variants: readonly EnvironmentVariant[];
  readonly busy: boolean;
  readonly assign: (member: string, variant: EnvironmentVariant, value: string, onDone: () => void) => void;
}

/** Selects a team variant for one member; a per-member variant takes that member's own value, written once. */
export function AssignForm({ members, variants, busy, assign }: AssignFormProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Section label={t('environment.assign.title')}>
      {isNonEmpty(members) && isNonEmpty(variants) ? (
        <AssignFields members={members} variants={variants} busy={busy} assign={assign} />
      ) : (
        <p className="o-row__meta">{t('environment.assign.nothing')}</p>
      )}
    </Section>
  );
}

function AssignFields({
  members,
  variants,
  busy,
  assign,
}: Pick<AssignFormProps, 'busy' | 'assign'> & {
  readonly members: NonEmpty<MemberEnvironment>;
  readonly variants: NonEmpty<EnvironmentVariant>;
}): ReactElement {
  const { t } = useTranslation();
  const [pickedMember, setMember] = useState(members[0].id);
  // The chosen member, or the first one once they are gone from the list: what is sent is what the select shows.
  const chosenMember = (members.find((member) => member.id === pickedMember) ?? members[0]).id;
  const [variantId, setVariantId] = useState(variants[0].id);
  // A value is typed for one variant: it never follows to another choice.
  const [typed, setTyped] = useState({ variant: '', value: '' });
  const [tried, setTried] = useState(false);
  // The chosen variant, or the first one once it is gone from the list.
  const variant = variants.find((candidate) => candidate.id === variantId) ?? variants[0];
  const perMember = bindingOf(variant.binding) === 'perMember';
  const value = typed.variant === variant.id ? typed.value : '';
  const missingValue = perMember && value === '';
  return (
    <form
      className="o-stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (missingValue) return;
        assign(chosenMember, variant, value, () => {
          setTyped({ variant: '', value: '' });
          setTried(false);
        });
      }}
    >
      <Choice
        label={t('environment.assign.member')}
        value={chosenMember}
        options={members.map((item) => ({ value: item.id, label: item.label }))}
        onChange={(next) => {
          setMember(next);
          // A member's value never follows to another member.
          setTyped({ variant: '', value: '' });
        }}
      />
      <Choice
        label={t('environment.assign.variant')}
        value={variant.id}
        options={variants.map((item) => ({
          value: item.id,
          label: `${item.variable}: ${item.name} (${t(`environment.binding.${bindingOf(item.binding)}.short`)})`,
        }))}
        onChange={(next) => {
          setVariantId(next);
          setTyped({ variant: '', value: '' });
        }}
      />
      {perMember ? (
        <Field
          label={t('environment.assign.value')}
          secret
          mono
          maxLength={VALUE_MAX}
          hint={t('environment.assign.valueHint')}
          value={value}
          onChange={(next) => {
            setTyped({ variant: variant.id, value: next });
          }}
        />
      ) : null}
      <p className="o-row__meta">{t('environment.assign.hint')}</p>
      {tried && missingValue ? (
        <Banner tone="warning" tag={t('environment.problemTag')} live>
          {t('environment.assign.needsValue')}
        </Banner>
      ) : null}
      <div className="o-inline">
        <Button type="submit" disabled={busy}>
          {t('environment.assign.submit')}
        </Button>
      </div>
    </form>
  );
}
