// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import type { MessageFile } from '../events';
import {
  type FileProblem,
  type PendingFile,
  progressOf,
  retryable,
  sizeLabel,
  typesLabel,
  waitLabel,
} from '../files';
import type { SessionFilesViewModel } from '../useSessionFiles';

/**
 * The paperclip beside the message field (TeamCode's companion `AttachButton`): the browser's file dialog (several
 * files at once). While no file can be added (files off for the organization, or already the most a message carries),
 * a click explains why instead.
 */
export function AttachButton({ files }: { readonly files: SessionFilesViewModel }): ReactElement {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        onClick={() => {
          if (files.canAttach) input.current?.click();
          else files.explainUnavailable();
        }}
      >
        {t('cloudConversation.files.attach')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={t('cloudConversation.files.attach')}
        onChange={(event) => {
          files.attach(Array.from(event.target.files ?? []));
          // The same file can be picked again after it was removed.
          event.target.value = '';
        }}
      />
    </>
  );
}

/** The files of the next message, one chip each: its name, then its progress, its size once uploaded, or its problem. */
export function PendingFileChips({ files }: { readonly files: SessionFilesViewModel }): ReactElement | null {
  const { t } = useTranslation();
  if (files.files.length === 0) return null;
  return (
    <ul className="cc-files" aria-label={t('cloudConversation.files.list')}>
      {files.files.map((file) => (
        <FileChip key={file.localId} file={file} files={files} />
      ))}
    </ul>
  );
}

function FileChip({
  file,
  files,
}: {
  readonly file: PendingFile;
  readonly files: SessionFilesViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const failed = file.state === 'failed';
  return (
    <li className={failed ? 'cc-file cc-file--failed' : 'cc-file'}>
      <span className="cc-file__head">
        <span className="cc-file__name">{file.name}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('cloudConversation.files.remove', { name: file.name })}
          onClick={() => {
            files.remove(file.localId);
          }}
        >
          ×
        </Button>
      </span>
      {file.state === 'uploading' ? (
        <>
          <progress className="cc-file__progress" value={progressOf(file)} max={1} aria-label={file.name} />
          <span className="cc-meta">
            {t('cloudConversation.files.progress', {
              sent: sizeLabel(file.sent),
              size: sizeLabel(file.size),
            })}
          </span>
        </>
      ) : file.problem === undefined ? (
        // Uploaded: only a failed file has a problem.
        <span className="cc-meta">
          {t('cloudConversation.files.uploaded')} · {sizeLabel(file.size)}
        </span>
      ) : (
        <>
          <span className="cc-meta cc-danger" role="status">
            <FileProblemText problem={file.problem} />
          </span>
          {retryable(file.problem) ? (
            <span>
              <Button
                variant="ghost"
                onClick={() => {
                  files.retry(file.localId);
                }}
              >
                {t('cloudConversation.files.retry')}
              </Button>
            </span>
          ) : null}
        </>
      )}
    </li>
  );
}

/** The files a message carries, under its text: in the transcript, or on a message on its way. */
export function MessageFiles({
  files,
}: {
  readonly files: readonly Pick<MessageFile, 'id' | 'name' | 'size'>[];
}): ReactElement | null {
  if (files.length === 0) return null;
  return (
    <ul className="cc-message-files">
      {files.map((file) => (
        <li key={file.id} className="cc-meta">
          {file.name} ({sizeLabel(file.size)})
        </li>
      ))}
    </ul>
  );
}

/** The sentence for `problem`. */
export function FileProblemText({ problem }: { readonly problem: FileProblem }): ReactElement {
  const { t } = useTranslation();
  return <>{problemText(problem, t)}</>;
}

type Translate = ReturnType<typeof useTranslation>['t'];

function problemText(problem: FileProblem, t: Translate): string {
  switch (problem.kind) {
    case 'tooMany':
      return t('cloudConversation.files.problem.tooMany', { max: problem.max });
    case 'tooLarge':
      return t('cloudConversation.files.problem.tooLarge', { size: sizeLabel(problem.maxBytes) });
    case 'messageTooLarge':
      return t('cloudConversation.files.problem.messageTooLarge', { size: sizeLabel(problem.maxBytes) });
    case 'typeNotAllowed':
      return t('cloudConversation.files.problem.typeNotAllowed', { types: typesLabel(problem.types) });
    case 'quota':
      return problem.retryAfterSeconds === undefined
        ? t('cloudConversation.files.problem.quotaSession')
        : t('cloudConversation.files.problem.quotaDaily', { wait: waitLabel(problem.retryAfterSeconds) });
    case 'other':
      return t('cloudConversation.files.problem.other', { code: problem.code ?? 'error' });
    case 'empty':
    case 'unreadable':
    case 'storageNotConfigured':
    case 'storageUnavailable':
    case 'integrity':
    case 'denied':
    case 'unreachable':
    case 'unsupported':
    case 'sessionGone':
      return t(`cloudConversation.files.problem.${problem.kind}`);
  }
}

/** Whether a drag carries files (not text or a link). */
function carriesFiles(transfer: DataTransfer | null): transfer is DataTransfer {
  return transfer !== null && Array.from(transfer.types).includes('Files');
}

/**
 * The session's content, taking files dropped anywhere on it when `files` are supported, with a line that says so
 * while files are dragged over it.
 */
export function FileDropArea({
  files,
  children,
}: {
  readonly files: SessionFilesViewModel;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const area = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const { supported, attach } = files;
  useEffect(() => {
    const element = area.current;
    if (!supported || element === null) return;
    const over = (event: DragEvent): void => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      setDropping(true);
    };
    const leave = (event: DragEvent): void => {
      // Leaving for a child is not leaving the area.
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      setDropping(false);
    };
    const drop = (event: DragEvent): void => {
      const transfer = event.dataTransfer;
      if (!carriesFiles(transfer)) return;
      event.preventDefault();
      setDropping(false);
      attach(Array.from(transfer.files));
    };
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => {
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [supported, attach]);
  return (
    <div ref={area} className={dropping ? 'cc-drop cc-drop--over' : 'cc-drop'}>
      {dropping ? (
        <p className="cc-drop__hint" role="status">
          {t('cloudConversation.files.drop')}
        </p>
      ) : null}
      {children}
    </div>
  );
}
