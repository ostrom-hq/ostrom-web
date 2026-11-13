// SPDX-License-Identifier: Apache-2.0
import { importTeamCodeMutation } from '@gen/api/@tanstack/react-query.gen';
import type { ImportReport, TeamCodeImportRequestWritable } from '@gen/api/types.gen';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import {
  type ExportProblem,
  type ExportSummary,
  type ImportMode,
  parseExport,
  queryOf,
  summarize,
} from './model';

/** Why a run failed, as the screen words it: the cases the contract names, or the server's message. */
export type ImportFailure =
  /** The server refused the cutover before writing anything: an owner only, no audit log, no shared accounts. */
  | { readonly kind: CutoverRefusal }
  /**
   * Any other cutover failure: unless it is known to come before the audit entry, it may have run, so the screen says to
   * look first. A refusal before the write that is not one of the three known ones lands here too, on the safe side.
   */
  | { readonly kind: 'cutoverUnknown'; readonly message: string }
  | { readonly kind: 'other'; readonly message: string };

export interface TeamCodeImportViewModel {
  /** The chosen file's name, what it holds in counts, and its runs. */
  readonly file: ChosenExport | undefined;
  /** Why the chosen file cannot be imported. */
  readonly fileProblem: ExportProblem | 'read' | undefined;
  /** The last report of each run, since the file was chosen. */
  readonly reports: Readonly<Partial<Record<ImportMode, ImportReport>>>;
  /** The run on its way. */
  readonly running: ImportMode | undefined;
  readonly failure: ImportFailure | undefined;
  readonly choose: (file: File) => void;
  /** Drops the file and its reports: the credentials it holds leave the page's memory. */
  readonly forget: () => void;
}

export interface ChosenExport {
  readonly name: string;
  readonly summary: ExportSummary;
  readonly run: (mode: ImportMode) => void;
}

interface Loaded {
  readonly name: string;
  readonly request: TeamCodeImportRequestWritable;
  readonly summary: ExportSummary;
}

export type CutoverRefusal = 'ownersOnly' | 'noAudit' | 'noSharing';

/**
 * The three refusals the server raises before the cutover writes anything (ostrom-server `ImportTeamCodeUseCase`,
 * `startCutover`), by their status, error type and message: the error type alone (`forbidden`, `unavailable`) is
 * shared with failures that may come after a write, and the server has no code of its own for these yet.
 */
const CUTOVER_REFUSALS: readonly {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly kind: CutoverRefusal;
}[] = [
  {
    status: 403,
    code: 'forbidden',
    message: 'Only an owner of the organization runs the cutover import.',
    kind: 'ownersOnly',
  },
  {
    status: 503,
    code: 'unavailable',
    message: 'This server keeps no audit log, so it cannot record a cutover import.',
    kind: 'noAudit',
  },
  {
    status: 503,
    code: 'unavailable',
    message: 'This server does not import shared accounts, so it has no cutover to run.',
    kind: 'noSharing',
  },
];

export function failureFrom(mode: ImportMode | undefined, error: unknown): ImportFailure | undefined {
  const failure = failureOf(error);
  if (failure === undefined) return undefined;
  if (mode !== 'cutover') return { kind: 'other', message: failure.message };
  const refusal = isApiFailure(failure)
    ? CUTOVER_REFUSALS.find(
        (known) =>
          known.status === failure.status && known.code === failure.code && known.message === failure.message,
      )
    : undefined;
  if (refusal !== undefined) return { kind: refusal.kind };
  // The server writes the audit entry first, and anything after it may still fail, 4xx included: only what is known
  // to come before (a request the client never sent, a session refused at the door) wrote nothing.
  return wroteNothing(failure)
    ? { kind: 'other', message: failure.message }
    : { kind: 'cutoverUnknown', message: failure.message };
}

function wroteNothing(failure: Error): boolean {
  return isApiFailure(failure) && (failure.kind === 'invalid-request' || failure.kind === 'unauthorized');
}

export function useTeamCodeImport(): TeamCodeImportViewModel {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [fileProblem, setFileProblem] = useState<ExportProblem | 'read' | undefined>(undefined);
  const [reports, setReports] = useState<Partial<Record<ImportMode, ImportReport>>>({});
  // The body carries credentials in clear: the mutation is never cached beyond this screen.
  const mutation = useMutation({ ...importTeamCodeMutation(), gcTime: 0 });
  const { mutate, reset } = mutation;
  // Each choice or forgetting moves it on: a file read late never replaces the one chosen after it.
  const choice = useRef(0);
  const forget = useCallback(() => {
    choice.current += 1;
    setLoaded(undefined);
    setFileProblem(undefined);
    setReports({});
    reset();
  }, [reset]);
  const choose = useCallback(
    (file: File) => {
      forget();
      const id = choice.current;
      file.text().then(
        (text) => {
          if (id !== choice.current) return;
          const parsed = parseExport(text);
          if ('problem' in parsed) setFileProblem(parsed.problem);
          else setLoaded({ name: file.name, request: parsed.request, summary: summarize(parsed.request) });
        },
        () => {
          if (id === choice.current) setFileProblem('read');
        },
      );
    },
    [forget],
  );
  const run = useCallback(
    (loaded: Loaded, mode: ImportMode) => {
      mutate(
        { body: loaded.request, query: queryOf(mode) },
        {
          onSuccess: (report) => {
            setReports((previous) => ({ ...previous, [mode]: report }));
            // A real run wrote servers, secrets, policies and accounts: every screen reads them again.
            if (mode !== 'dryRun') void queryClient.invalidateQueries();
          },
        },
      );
    },
    [mutate, queryClient],
  );
  const file = useMemo(
    () =>
      loaded === undefined
        ? undefined
        : {
            name: loaded.name,
            summary: loaded.summary,
            run: (mode: ImportMode) => {
              run(loaded, mode);
            },
          },
    [loaded, run],
  );
  const running = mutation.isPending ? modeOf(mutation.variables.query) : undefined;
  const failed = mutation.isError ? modeOf(mutation.variables.query) : undefined;
  return {
    file,
    fileProblem,
    reports,
    running,
    failure: failureFrom(failed, mutation.error),
    choose,
    forget,
  };
}

function modeOf(query: { readonly dryRun?: boolean; readonly cutover?: boolean } | undefined): ImportMode {
  if (query?.dryRun === true) return 'dryRun';
  return query?.cutover === true ? 'cutover' : 'import';
}
