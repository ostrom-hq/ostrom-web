// SPDX-License-Identifier: Apache-2.0
import { getCloudFilePolicyOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { idempotencyKey } from '@/shared/api/idempotencyKey';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import {
  canAttach,
  check,
  type FileProblem,
  type FilePolicy,
  type FilesState,
  NO_FILES,
  type PendingFile,
  policyOf,
  problemOf,
  retryable,
  typeOf,
  type UploadedFile,
  uploadedOf,
} from './files';
import { uploadFile } from './upload';

/** The files of the next message, and what the composer does with them. */
export interface SessionFilesViewModel extends FilesState {
  /** The paperclip shows: the server takes files. When the organization's storage is off, a click explains it instead. */
  readonly supported: boolean;
  readonly canAttach: boolean;
  /** Every file is uploaded: the message may go. */
  readonly ready: boolean;
  /** Checks each picked or dropped file then uploads it; one refused before upload is said in `notice`. */
  readonly attach: (picked: readonly File[]) => void;
  /** The paperclip, clicked while files cannot be added: says why instead of opening a picker. */
  readonly explainUnavailable: () => void;
  /** Uploads a failed file again, under the same key: the server never stores it twice. */
  readonly retry: (localId: string) => void;
  /** Drops a file from the next message, stopping its upload. */
  readonly remove: (localId: string) => void;
  readonly dismissNotice: () => void;
  /** The uploaded files, in order, for the message being sent; undefined while one still uploads or failed. */
  readonly uploaded: () => readonly UploadedFile[] | undefined;
  /** The message took the files: the composer starts over. */
  readonly clear: () => void;
}

/** A file being sent: its bytes, the key all its attempts share, and what stops it. */
interface Source {
  readonly file: File;
  readonly key: string;
  controller: AbortController | undefined;
}

/**
 * The pending files of one session's composer (TeamCode's companion `SessionFiles`): reads the policy once the server
 * announces `runners.cloud.files.v1` (nothing is asked otherwise), checks then uploads each picked file, retries a
 * failed upload with its idempotency key, and hands the uploaded files to the next message.
 */
export function useSessionFiles(sessionId: string): SessionFilesViewModel {
  const announced = useAnnounced('runners.cloud.files.v1');
  // A policy that cannot be read shows no paperclip; the next time the screen opens, it is read again.
  const query = useQuery(ready(getCloudFilePolicyOptions(), { retry: false, enabled: announced }));
  const policy = useMemo(
    () => (announced && query.data !== undefined ? policyOf(query.data) : undefined),
    [announced, query.data],
  );
  const [state, setState] = useState<FilesState>(NO_FILES);
  /** The state as last written: several files picked at once are each checked against the ones before them. */
  const current = useRef<FilesState>(NO_FILES);
  const sources = useRef(new Map<string, Source>());

  const write = useCallback((change: (state: FilesState) => FilesState) => {
    current.current = change(current.current);
    setState(current.current);
  }, []);

  const update = useCallback(
    (localId: string, change: (file: PendingFile) => PendingFile) => {
      write((state) => ({
        ...state,
        files: state.files.map((file) => (file.localId === localId ? change(file) : file)),
      }));
    },
    [write],
  );

  // Leaving the screen stops every upload under way.
  useEffect(() => {
    const known = sources.current;
    return () => {
      for (const source of known.values()) source.controller?.abort();
    };
  }, []);

  /** Uploads `source` for the chip `localId`; a chip removed meanwhile is simply no longer there to change. */
  const upload = useCallback(
    (localId: string, source: Source, policy: FilePolicy) => {
      const controller = new AbortController();
      source.controller = controller;
      let shown = -1;
      const run = async (): Promise<void> => {
        try {
          const file = await uploadFile({
            sessionId,
            file: source.file,
            name: source.file.name,
            contentType: typeOf(source.file, policy),
            idempotencyKey: source.key,
            signal: controller.signal,
            onProgress: (sent, total) => {
              // One change per percent, not per progress event (a picked file is never empty).
              const percent = Math.floor((sent * 100) / total);
              if (percent === shown) return;
              shown = percent;
              update(localId, (item) => ({ ...item, sent }));
            },
          });
          update(localId, (item) => ({
            ...item,
            state: 'uploaded',
            sent: item.size,
            uploaded: file,
            name: file.name,
          }));
        } catch (error) {
          update(localId, (item) => ({
            ...item,
            state: 'failed',
            sent: 0,
            problem: problemOf(error, policy),
          }));
        } finally {
          source.controller = undefined;
        }
      };
      void run();
    },
    [sessionId, update],
  );

  const attach = useCallback(
    (picked: readonly File[]) => {
      const known = policy;
      if (known === undefined) return;
      let notice: FileProblem | undefined;
      for (const file of picked) {
        const problem = check(file, current.current.files, known);
        if (problem !== undefined) {
          notice = problem;
          continue;
        }
        const localId = idempotencyKey();
        const source: Source = { file, key: idempotencyKey(), controller: undefined };
        sources.current.set(localId, source);
        write((state) => ({
          ...state,
          files: [
            ...state.files,
            {
              localId,
              name: file.name,
              size: file.size,
              state: 'uploading',
              sent: 0,
              uploaded: undefined,
              problem: undefined,
            },
          ],
        }));
        upload(localId, source, known);
      }
      write((state) => ({ ...state, notice }));
    },
    [policy, upload, write],
  );

  const explainUnavailable = useCallback(() => {
    const known = policy;
    if (known === undefined) return;
    if (!known.available) write((state) => ({ ...state, notice: { kind: 'storageNotConfigured' } }));
    else if (current.current.files.length >= known.maxFiles)
      write((state) => ({ ...state, notice: { kind: 'tooMany', max: known.maxFiles } }));
  }, [policy, write]);

  const retry = useCallback(
    (localId: string) => {
      const known = policy;
      const file = current.current.files.find((item) => item.localId === localId);
      const source = sources.current.get(localId);
      // Only a failed file whose problem may pass is sent again (the chip offers Retry for no other).
      if (known === undefined || source === undefined || file?.problem === undefined) return;
      if (!retryable(file.problem)) return;
      update(localId, (item) => ({ ...item, state: 'uploading', sent: 0, problem: undefined }));
      upload(localId, source, known);
    },
    [policy, update, upload],
  );

  const remove = useCallback(
    (localId: string) => {
      sources.current.get(localId)?.controller?.abort();
      sources.current.delete(localId);
      write((state) => ({
        ...state,
        files: state.files.filter((file) => file.localId !== localId),
        notice: undefined,
      }));
    },
    [write],
  );

  const dismissNotice = useCallback(() => {
    write((state) => ({ ...state, notice: undefined }));
  }, [write]);

  const uploaded = useCallback(() => uploadedOf(current.current.files), []);

  const clear = useCallback(() => {
    for (const source of sources.current.values()) source.controller?.abort();
    sources.current.clear();
    write(() => NO_FILES);
  }, [write]);

  const shown: FilesState = { ...state, policy };
  return {
    ...shown,
    supported: policy !== undefined,
    canAttach: canAttach(shown),
    ready: uploadedOf(state.files) !== undefined,
    attach,
    explainUnavailable,
    retry,
    remove,
    dismissNotice,
    uploaded,
    clear,
  };
}
