import type { Ask } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { DecideViewModel } from '../useYes';

export interface DecisionBarProps {
  readonly ask: Ask;
  readonly viewer: string | undefined;
  readonly decision: DecideViewModel;
}

/** Fixed at the bottom on a phone: the one garnet action of the screen. */
export function DecisionBar({ ask, viewer, decision }: DecisionBarProps): ReactElement {
  const { t } = useTranslation();
  const { decide, signing, refusal, failure } = decision;
  const busy = signing !== undefined;
  return (
    <footer className="ys-act">
      {refusal === undefined ? null : (
        <Banner tone="danger" tag={t('yes.act.refusedTag')} live>
          {refusal.error}
        </Banner>
      )}
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('yes.act.errorTag')} live>
          {failure.message}
        </Banner>
      )}
      {refusal === undefined && ask.you?.self === true && !ask.you.canApprove ? (
        <Banner tone="warning" tag={t('yes.act.youAskedTag')}>
          {ask.you.reason}
        </Banner>
      ) : null}
      {ask.you?.selfApproval === true ? (
        <Banner tag={t('yes.act.onlyApproverTag')}>{t('yes.act.onlyApprover')}</Banner>
      ) : null}
      {viewer === undefined ? null : (
        <p className="ys-small ys-meta">{t('yes.act.signedAs', { login: viewer })}</p>
      )}
      <div className="ys-act__buttons">
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            decide('rejected');
          }}
        >
          {signing === 'rejected' ? t('yes.act.refusing') : t('yes.act.no')}
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            decide('approved');
          }}
        >
          {signing === 'approved' ? t('yes.act.signing') : t('yes.act.yes')}
        </Button>
      </div>
    </footer>
  );
}
