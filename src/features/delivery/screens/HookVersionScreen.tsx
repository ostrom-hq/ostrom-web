// SPDX-License-Identifier: Apache-2.0
import type { ArtifactFileContent } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { WithOrg } from '@/shared/org/WithOrg';
import { LoadState, Screen, Section } from '@/shared/ui/Screen';
import { Administrators } from '../components/Administrators';
import { Definition } from '../components/Definition';
import { printable } from '../model';
import { useHookCode } from '../useHooks';
import './delivery.css';

/**
 * What a hook version runs, as an administrator reads it before pinning it: its definition, then every file in full.
 * The server verified it against its digest; the files are text on the page, never run or fetched.
 */
export function HookVersionScreen(): ReactElement {
  const { t } = useTranslation();
  const { name, version } = useParams({ from: '/hooks/$name/versions/$version' });
  return (
    <WithOrg title={t('delivery.code.title', { name, version })}>
      {() => (
        <Administrators delivered="hooks">
          <HookCode name={name} version={version} />
        </Administrators>
      )}
    </WithOrg>
  );
}

function HookCode({ name, version }: { readonly name: string; readonly version: string }): ReactElement {
  const { t } = useTranslation();
  const view = useHookCode(name, version);
  return (
    <LoadState data={view.artifact} failure={view.failure}>
      {(artifact) => (
        <Screen
          top={
            <Link to="/hooks/$name" params={{ name }} className="o-back">
              {t('delivery.code.back')}
            </Link>
          }
          title={t('delivery.code.title', { name, version })}
          lead={t('delivery.code.lead')}
        >
          <Section label={t('delivery.code.definition')}>
            <p className="o-row__meta o-mono dl-digest">{artifact.digest}</p>
            <Definition definition={artifact.definition} />
          </Section>
          {artifact.files.map((file) => (
            <FileSection key={file.path} file={file} />
          ))}
        </Screen>
      )}
    </LoadState>
  );
}

function FileSection({ file }: { readonly file: ArtifactFileContent }): ReactElement {
  const { t } = useTranslation();
  const text = printable(file.contentBase64);
  return (
    <Section label={file.path}>
      <p className="o-row__meta">{`${file.mode}, ${t('delivery.content.size', { count: file.size })}`}</p>
      {text === undefined ? (
        <p className="o-row__meta">{t('delivery.code.binary')}</p>
      ) : (
        <pre className="dl-file">{text}</pre>
      )}
    </Section>
  );
}
