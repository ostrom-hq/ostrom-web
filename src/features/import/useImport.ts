// SPDX-License-Identifier: AGPL-3.0-only
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
  /** The server itself refused the cutover before writing anything (an owner only, no audit log…), in its words. */
  | { readonly kind: 'refused'; readonly message: string }
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

function failureFrom(mode: ImportMode | undefined, error: unknown): ImportFailure | undefined {
  const failure = failureOf(error);
  if (failure === undefined) return undefined;
  if (mode === 'cutover' && isApiFailure(failure)) {
    // The cutover is owners only, and needs an audit log and the shared accounts (contract, `cutover`): the server
    // checks both before it writes, and answers with its own error (`forbidden`, `unavailable`). A bare 503 from a
    // proxy has no such error, and says nothing about what was written.
    if (failure.code === 'forbidden' || failure.code === 'unavailable')
      return { kind: 'refused', message: failure.message };
  }
  return { kind: 'other', message: failure.message };
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
