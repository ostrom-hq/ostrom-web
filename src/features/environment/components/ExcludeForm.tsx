// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { ENV_VARIABLE, isNonEmpty, type MemberEnvironment, type NonEmpty } from '../model';
import { Choice, Field } from './Field';

export interface ExcludeFormProps {
  readonly members: readonly MemberEnvironment[];
  readonly busy: boolean;
  readonly exclude: (member: string, variable: string, onDone: () => void) => void;
}

/** Keeps one member from a variable, whatever is assigned: an exclusion beats every assignment. */
export function ExcludeForm({ members, busy, exclude }: ExcludeFormProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Section label={t('environment.exclude.title')}>
      {isNonEmpty(members) ? (
        <ExcludeFields members={members} busy={busy} exclude={exclude} />
      ) : (
        <p className="o-row__meta">{t('environment.exclude.nobody')}</p>
      )}
    </Section>
  );
}

function ExcludeFields({
  members,
  busy,
  exclude,
}: Omit<ExcludeFormProps, 'members'> & { readonly members: NonEmpty<MemberEnvironment> }): ReactElement {
  const { t } = useTranslation();
  const [picked, setChosen] = useState(members[0].id);
  // The chosen member, or the first one once they are gone from the list: what is sent is what the select shows.
  const chosen = (members.find((member) => member.id === picked) ?? members[0]).id;
  const [variable, setVariable] = useState('');
  const [tried, setTried] = useState(false);
  const trimmed = variable.trim();
  const bad = !ENV_VARIABLE.test(trimmed);
  return (
    <form
      className="o-stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (bad) return;
        exclude(chosen, trimmed, () => {
          setVariable('');
          setTried(false);
        });
      }}
    >
      <Choice
        label={t('environment.assign.member')}
        value={chosen}
        options={members.map((item) => ({ value: item.id, label: item.label }))}
        onChange={setChosen}
      />
      <Field
        label={t('environment.create.variable')}
        mono
        maxLength={128}
        placeholder="GITHUB_TOKEN"
        hint={t('environment.exclude.hint')}
        value={variable}
        onChange={setVariable}
      />
      {(tried || trimmed !== '') && bad ? (
        <Banner tone="warning" tag={t('environment.problemTag')} live>
          {t('environment.create.problem.variable')}
        </Banner>
      ) : null}
      <div className="o-inline">
        <Button type="submit" disabled={busy}>
          {t('environment.exclude.submit')}
        </Button>
      </div>
    </form>
  );
}
