import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { diffLineKind } from '../model';

export interface DiffViewProps {
  readonly diff: string;
}

export function DiffView({ diff }: DiffViewProps): ReactElement {
  const { t } = useTranslation();
  const lines = diff.split('\n');
  return (
    <pre className="ys-diff" tabIndex={0} aria-label={t('yes.detail.diff')}>
      {lines.map((line, index) => (
        <span
          key={`${String(index)}:${line}`}
          className={`ys-diff__line ys-diff__line--${diffLineKind(line)}`}
        >
          {line.length > 0 ? line : ' '}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}
