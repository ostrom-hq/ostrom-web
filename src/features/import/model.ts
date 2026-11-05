// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ImportItem,
  ImportReport,
  TeamCodeAccountWritable,
  TeamCodeAssignmentWritable,
  TeamCodeImportRequestWritable,
  TeamCodeMcpServerWritable,
  TeamCodeStdioWritable,
} from '@gen/api/types.gen';
import type {
  zTeamCodeAccountWritable,
  zTeamCodeAssignmentWritable,
  zTeamCodeMcpServerWritable,
  zTeamCodeStdioWritable,
} from '@gen/api/zod.gen';
import { zTeamCodeImportRequestWritable } from '@gen/api/zod.gen';
import type { z } from 'zod/mini';

/** The three runs, in the order they are made: the plan, the real import, then the cutover once TeamCode stops. */
export const IMPORT_MODES = ['dryRun', 'import', 'cutover'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

/** The query of each run: the plan writes nothing, the cutover is the final run. */
export function queryOf(mode: ImportMode): { readonly dryRun?: boolean; readonly cutover?: boolean } {
  switch (mode) {
    case 'dryRun':
      return { dryRun: true };
    case 'import':
      return {};
    case 'cutover':
      return { cutover: true };
  }
}

export type ExportProblem = 'json' | 'shape';

/**
 * What `ostrom import teamcode` read from TeamCode, from the file chosen: `unknown` until the contract's schema
 * parses it. The file holds credentials in clear: nothing of it is shown, logged or kept beyond the screen.
 */
export function parseExport(
  text: string,
): { readonly request: TeamCodeImportRequestWritable } | { readonly problem: ExportProblem } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { problem: 'json' };
  }
  const parsed = zTeamCodeImportRequestWritable.safeParse(json);
  return parsed.success ? { request: requestFrom(parsed.data) } : { problem: 'shape' };
}

/*
 * A parsed file as the contract's request: an absent field stays absent, never `undefined` (the request type
 * has exact optional properties).
 */
function stdioFrom(parsed: z.output<typeof zTeamCodeStdioWritable>): TeamCodeStdioWritable {
  const stdio: TeamCodeStdioWritable = { launcher: parsed.launcher, packageName: parsed.packageName };
  if (parsed.args !== undefined) stdio.args = parsed.args;
  if (parsed.secretEnv !== undefined) stdio.secretEnv = parsed.secretEnv;
  return stdio;
}

function serverFrom(parsed: z.output<typeof zTeamCodeMcpServerWritable>): TeamCodeMcpServerWritable {
  const server: TeamCodeMcpServerWritable = { id: parsed.id, target: parsed.target, variant: parsed.variant };
  if (parsed.perMember !== undefined) server.perMember = parsed.perMember;
  if (parsed.url !== undefined) server.url = parsed.url;
  if (parsed.credentialHeader !== undefined) server.credentialHeader = parsed.credentialHeader;
  if (parsed.sharedSecret !== undefined) server.sharedSecret = parsed.sharedSecret;
  if (parsed.stdio !== undefined) server.stdio = stdioFrom(parsed.stdio);
  if (parsed.toolMode !== undefined) server.toolMode = parsed.toolMode;
  if (parsed.tools !== undefined) server.tools = parsed.tools;
  return server;
}

function assignmentFrom(parsed: z.output<typeof zTeamCodeAssignmentWritable>): TeamCodeAssignmentWritable {
  const assignment: TeamCodeAssignmentWritable = { memberId: parsed.memberId, serverId: parsed.serverId };
  if (parsed.memberSecret !== undefined) assignment.memberSecret = parsed.memberSecret;
  return assignment;
}

function accountFrom(parsed: z.output<typeof zTeamCodeAccountWritable>): TeamCodeAccountWritable {
  const account: TeamCodeAccountWritable = {
    provider: parsed.provider,
    providerAccountId: parsed.providerAccountId,
    label: parsed.label,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
  };
  if (parsed.email !== undefined) account.email = parsed.email;
  if (parsed.disabled !== undefined) account.disabled = parsed.disabled;
  return account;
}

function requestFrom(parsed: z.output<typeof zTeamCodeImportRequestWritable>): TeamCodeImportRequestWritable {
  const request: TeamCodeImportRequestWritable = {};
  if (parsed.members !== undefined) request.members = parsed.members;
  if (parsed.mcpServers !== undefined) request.mcpServers = parsed.mcpServers.map(serverFrom);
  if (parsed.assignments !== undefined) request.assignments = parsed.assignments.map(assignmentFrom);
  if (parsed.accounts !== undefined) request.accounts = parsed.accounts.map(accountFrom);
  if (parsed.memberMap !== undefined) request.memberMap = parsed.memberMap;
  return request;
}

export interface ExportSummary {
  readonly members: number;
  readonly servers: number;
  readonly assignments: number;
  readonly accounts: number;
  /** TeamCode members with no Ostrom member in the map: their assignments are skipped. */
  readonly unmapped: readonly string[];
}

/** What the file holds, in counts and names only: never a credential. */
export function summarize(request: TeamCodeImportRequestWritable): ExportSummary {
  const members = request.members ?? [];
  const map = request.memberMap ?? {};
  return {
    members: members.length,
    servers: request.mcpServers?.length ?? 0,
    assignments: request.assignments?.length ?? 0,
    accounts: request.accounts?.length ?? 0,
    unmapped: members.filter((member) => map[member.id] === undefined).map((member) => member.username),
  };
}

export const REPORT_ACTIONS = [
  'planned',
  'created',
  'updated',
  'unchanged',
  'skipped',
  'revive_at_cutover',
] as const satisfies readonly ImportItem['action'][];
export type ReportAction = (typeof REPORT_ACTIONS)[number];

/** How many lines of each action: the report's own counts, and the planned lines counted from the items. */
export function countsOf(report: ImportReport): Readonly<Record<ReportAction, number>> {
  return {
    planned: report.items.filter((item) => item.action === 'planned').length,
    created: report.created,
    updated: report.updated,
    unchanged: report.unchanged,
    skipped: report.skipped,
    revive_at_cutover: report.reviveAtCutover,
  };
}

/** What a run would write or wrote: the lines planned, created or updated. */
export function changesOf(report: ImportReport): number {
  return report.items.filter(
    (item) => item.action === 'planned' || item.action === 'created' || item.action === 'updated',
  ).length;
}
