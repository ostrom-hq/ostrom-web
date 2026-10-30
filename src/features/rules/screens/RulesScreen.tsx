// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { RuleCard } from '../components/RuleCard';
import { countRules, groupRules, matches, RULE_FILTERS, type RuleFilter, sureProposals } from '../model';
import { useBulkAccept, useRuleDecision, useRules } from '../useRules';
import './rules.css';

export function RulesScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useRules();
  const decision = useRuleDecision();
  const bulk = useBulkAccept();
  const [filter, setFilter] = useState<RuleFilter>('todo');
  return (
    <Screen title={t('rules.title')} lead={t('rules.lead')}>
      {decision.failure === undefined ? null : (
        <Banner tone="danger" tag={t('rules.errorTag')} live>
          {decision.failure.message}
        </Banner>
      )}
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
          const shown = rules.filter((rule) => matches(rule, filter));
          const sure = sureProposals(shown);
          return (
            <>
              <div className="o-inline rl-filters" role="group" aria-label={t('rules.filter.label')}>
                {RULE_FILTERS.map((option) => (
                  <Button
                    key={option}
                    variant="ghost"
                    aria-pressed={filter === option}
                    onClick={() => {
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
              {shown.length === 0 ? (
                <p className="o-empty">{t(`rules.empty.${filter}`)}</p>
              ) : (
                groupRules(shown).map((group) => (
                  <section key={group.name} className="o-stack" aria-label={group.name}>
                    <h2 className="o-label">{group.name}</h2>
                    {group.rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        saving={decision.saving === rule.id}
                        onDecide={
                          view.canDecide
                            ? (change, onSaved) => {
                                decision.decide(rule.id, change, onSaved);
                              }
                            : undefined
                        }
                      />
                    ))}
                  </section>
                ))
              )}
            </>
          );
        }}
      </LoadState>
    </Screen>
  );
}
