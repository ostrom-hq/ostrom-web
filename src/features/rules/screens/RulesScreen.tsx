// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useMemo, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { useStep } from '@/shared/lib/useStep';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { ShowMore } from '@/shared/ui/ShowMore';
import { RuleCard } from '../components/RuleCard';
import { RuleForm } from '../components/RuleForm';
import {
  countRules,
  firstOfGroups,
  groupRules,
  matches,
  newRuleOf,
  RULE_FILTERS,
  type RuleFilter,
  sureProposals,
} from '../model';
import { useBulkAccept, useCreateRule, useDeleteRule, useRuleDecision, useRules } from '../useRules';
import './rules.css';

export function RulesScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useRules();
  const decision = useRuleDecision();
  const bulk = useBulkAccept();
  const create = useCreateRule();
  const removal = useDeleteRule();
  const [filter, setFilter] = useState<RuleFilter>('todo');
  const [writing, setWriting] = useState(false);
  const groups = useMemo(
    () => [...new Set((view.rules ?? []).map((rule) => rule.group))].sort((a, b) => a.localeCompare(b, 'en')),
    [view.rules],
  );
  const shown = useMemo(
    () => (view.rules ?? []).filter((rule) => matches(rule, filter)),
    [view.rules, filter],
  );
  const grouped = useMemo(() => groupRules(shown), [shown]);
  // A hundred cards at a time: 2 000 rules on screen at once are seconds of rendering on a phone (PERF-CONSOLE).
  const step = useStep(shown.length, filter);
  return (
    <Screen title={t('rules.title')} lead={t('rules.lead')}>
      {create.failure === undefined ? null : (
        <Banner tone="danger" tag={t('rules.errorTag')} live>
          {create.failure.message}
        </Banner>
      )}
      {removal.deleted ? (
        <Banner tag={t('rules.delete.doneTag')} live>
          {t('rules.delete.done')}
        </Banner>
      ) : null}
      {removal.failure === undefined ? null : (
        <Banner tone="danger" tag={t('rules.errorTag')} live>
          {removal.failure.message}
        </Banner>
      )}
      {view.canDecide && !writing ? (
        <span className="rl-new">
          <Button
            onClick={() => {
              removal.dismiss();
              setWriting(true);
            }}
          >
            {t('rules.form.new')}
          </Button>
        </span>
      ) : null}
      {writing ? (
        <section className="o-card o-stack" aria-label={t('rules.form.newTitle')}>
          <h2 className="o-label">{t('rules.form.newTitle')}</h2>
          <RuleForm
            groups={groups}
            saving={create.creating}
            submit={t('rules.form.add')}
            onCancel={() => {
              setWriting(false);
            }}
            onSave={(draft, actions) => {
              create.create(newRuleOf(draft, actions), () => {
                setWriting(false);
                // A rule written by the team is accepted: it is found where accepted rules are.
                setFilter('accepted');
              });
            }}
          />
        </section>
      ) : null}
      {bulk.failure === undefined ? null : (
        <Banner tone="danger" tag={t('rules.errorTag')} live>
          {bulk.failure.message}
        </Banner>
      )}
      {bulk.updated === undefined ? null : (
        <Banner tag={t('rules.bulk.doneTag')} live>
          {t('rules.bulk.done', { count: bulk.updated })}
        </Banner>
      )}
      <LoadState data={view.rules} failure={view.failure}>
        {(rules) => {
          const counts = countRules(rules);
          const sure = sureProposals(shown);
          const onScreen = new Set(shown);
          return (
            <>
              <div className="o-inline rl-filters" role="group" aria-label={t('rules.filter.label')}>
                {RULE_FILTERS.map((option) => (
                  <Button
                    key={option}
                    variant="ghost"
                    aria-pressed={filter === option}
                    onClick={() => {
                      removal.dismiss();
                      setFilter(option);
                    }}
                  >
                    {t(`rules.filter.${option}`, { count: counts[option] })}
                  </Button>
                ))}
                {view.canDecide && sure.length > 0 ? (
                  <Button
                    disabled={bulk.sending}
                    onClick={() => {
                      bulk.accept(sure.map((rule) => rule.id));
                    }}
                  >
                    {t('rules.bulk.accept', { count: sure.length })}
                  </Button>
                ) : null}
              </div>
              {/* A refusal that came back once its rule left the list is still said, here. */}
              {rules
                .filter((rule) => !onScreen.has(rule))
                .map((rule) => {
                  const refused = decision.failure(rule.id);
                  return refused === undefined ? null : (
                    <Banner key={rule.id} tone="danger" tag={t('rules.errorTag')} live>
                      {t('rules.refusedElsewhere', { statement: rule.statement, message: refused.message })}
                    </Banner>
                  );
                })}
              {shown.length === 0 ? (
                <p className="o-empty">{t(`rules.empty.${filter}`)}</p>
              ) : (
                firstOfGroups(grouped, step.count).map((group) => (
                  <section key={group.name} className="o-stack" aria-label={group.name}>
                    <h2 className="o-label">{group.name}</h2>
                    {group.rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        groups={groups}
                        saving={decision.saving(rule.id) || removal.deleting === rule.id}
                        failure={decision.failure(rule.id)}
                        onDelete={() => {
                          removal.remove(rule.id);
                        }}
                        onDecide={
                          view.canDecide
                            ? (change, onSaved) => {
                                removal.dismiss();
                                decision.decide(rule.id, change, onSaved);
                              }
                            : undefined
                        }
                      />
                    ))}
                  </section>
                ))
              )}
              <ShowMore step={step} />
            </>
          );
        }}
      </LoadState>
    </Screen>
  );
}
