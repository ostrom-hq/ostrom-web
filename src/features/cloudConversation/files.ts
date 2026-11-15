// SPDX-License-Identifier: Apache-2.0
import type { CloudFilePolicy } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/**
 * Files sent with the next message (`runners.cloud.files.v1`, TeamCode's companion `SessionFile` models and
 * `SessionFilesUseCase`): the organization's policy, the checks made before any upload, and the problems an upload or
 * a check ends with, which the composer words.
 */

/** The server's ceiling of files per message, whatever the organization sets. */
export const MAX_FILES = 5;

/** What the organization allows (`GET /cloud/files/policy`): `available` false with `reason` when files are off. */
export interface FilePolicy {
  readonly available: boolean;
  readonly reason: string | undefined;
  readonly maxFileBytes: number;
  readonly maxMessageBytes: number;
  /** The number of files a message may carry: the organization's limit, never above the server's own five. */
  readonly maxFiles: number;
  readonly types: readonly string[];
}

/** The policy as the server reads it, its limits as numbers. */
export function policyOf(policy: CloudFilePolicy): FilePolicy {
  return {
    available: policy.available,
    reason: policy.reason,
    maxFileBytes: policy.maxFileBytes,
    maxMessageBytes: policy.maxMessageBytes,
    maxFiles: Math.min(Math.max(policy.maxFilesPerMessage, 1), MAX_FILES),
    types: policy.types,
  };
}

/** A file picked or dropped: its name (no path), its exact size in bytes, and the type the browser reported if any. */
export interface PickedFile {
  readonly name: string;
  readonly size: number;
  readonly type?: string | undefined;
}

/** A file stored by the server for this session, ready to be named in a message's `fileIds`. */
export interface UploadedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
}

/** Why a file cannot be attached, or was refused; the composer words each one. */
export type FileProblem =
  | { readonly kind: 'tooMany'; readonly max: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'tooLarge'; readonly maxBytes: number }
  /** With this file the message would carry more than the organization allows per message. */
  | { readonly kind: 'messageTooLarge'; readonly maxBytes: number }
  /** `types` the organization takes, as MIME types. */
  | { readonly kind: 'typeNotAllowed'; readonly types: readonly string[] }
  /** The file could not be read, or changed while it was sent: pick it again. */
  | { readonly kind: 'unreadable' }
  /** The member's daily quota (`retryAfterSeconds` set) or the session's buffer of unsent files is full. */
  | { readonly kind: 'quota'; readonly retryAfterSeconds: number | undefined }
  /** The organization has no tested storage: an administrator has to set it up. */
  | { readonly kind: 'storageNotConfigured' }
  | { readonly kind: 'storageUnavailable' }
  /** The server stored other bytes than the ones sent. */
  | { readonly kind: 'integrity' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unreachable' }
  /** The server does not take files (it lacks `runners.cloud.files.v1`). */
  | { readonly kind: 'unsupported' }
  /** The session is gone or no longer visible. */
  | { readonly kind: 'sessionGone' }
  /** Any other refusal; `code` is the server's stable code when it gave one. */
  | { readonly kind: 'other'; readonly code: string | undefined; readonly transient: boolean };

/** Trying again can work: the network, the organization's storage, a transfer that came out different. */
export function retryable(problem: FileProblem): boolean {
  switch (problem.kind) {
    case 'quota':
      return problem.retryAfterSeconds !== undefined;
    case 'storageUnavailable':
    case 'integrity':
    case 'unreachable':
      return true;
    case 'other':
      return problem.transient;
    case 'tooMany':
    case 'empty':
    case 'tooLarge':
    case 'messageTooLarge':
    case 'typeNotAllowed':
    case 'unreadable':
    case 'storageNotConfigured':
    case 'denied':
    case 'unsupported':
    case 'sessionGone':
      return false;
  }
}

/**
 * A file of the next message as the composer shows it: uploading (`sent` of `size` bytes), uploaded, or failed with
 * its problem (retried with the same idempotency key when the problem is retryable).
 */
export interface PendingFile {
  readonly localId: string;
  readonly name: string;
  readonly size: number;
  readonly state: 'uploading' | 'uploaded' | 'failed';
  readonly sent: number;
  readonly uploaded: UploadedFile | undefined;
  readonly problem: FileProblem | undefined;
}

/** Progress from 0 to 1 while uploading. */
export function progressOf(file: PendingFile): number {
  return file.size <= 0 ? 0 : Math.min(Math.max(file.sent / file.size, 0), 1);
}

/** The files of the next message, as the composer shows them. */
export interface FilesState {
  /** The policy once read; undefined before, or when the server does not take files (no paperclip then). */
  readonly policy: FilePolicy | undefined;
  /** In the order they were picked; each one uploads as soon as it is picked. */
  readonly files: readonly PendingFile[];
  /** A file refused before any upload (one too many, too large, a type not taken), or files that are off. */
  readonly notice: FileProblem | undefined;
}

export const NO_FILES: FilesState = { policy: undefined, files: [], notice: undefined };

/** A file can be added now: files are on, and the message carries fewer than it may. */
export function canAttach(state: FilesState): boolean {
  return state.policy?.available === true && state.files.length < state.policy.maxFiles;
}

export function uploading(state: FilesState): boolean {
  return state.files.some((file) => file.state === 'uploading');
}

/** The uploaded files, in order, for the message being sent; undefined while one still uploads or failed. */
export function uploadedOf(files: readonly PendingFile[]): readonly UploadedFile[] | undefined {
  const uploaded = files.flatMap((file) =>
    file.state === 'uploaded' && file.uploaded !== undefined ? [file.uploaded] : [],
  );
  return uploaded.length === files.length ? uploaded : undefined;
}

/**
 * The types a file may have, by its extension (TeamCode's `CloudFileTypes`): the server recognizes the type from the
 * bytes, this only guesses it for a local check and the request's `Content-Type`.
 */
const TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
};

/** The type of `name` by its extension (any case), or undefined for an extension this list does not know. */
export function typeFor(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return TYPES_BY_EXTENSION[name.slice(dot + 1).toLowerCase()];
}

const TEXT = 'text/plain';
const OCTET_STREAM = 'application/octet-stream';

/**
 * The type sent with `file`: by its extension first, then the browser's type. Any text type is sent as `text/plain`
 * when the organization takes it (a `.log` is text). Undefined when nothing says: the server recognizes the bytes.
 */
export function typeOf(file: PickedFile, policy: FilePolicy): string | undefined {
  const known = typeFor(file.name);
  if (known !== undefined) return known;
  const reported = (file.type ?? '').replace(/;.*$/s, '').trim().toLowerCase();
  if (reported === '' || reported === OCTET_STREAM) return undefined;
  return !policy.types.includes(reported) && reported.startsWith('text/') && policy.types.includes(TEXT)
    ? TEXT
    : reported;
}

/**
 * Why `file` cannot join `pending` under `policy`, or undefined when it can: checked before any upload, so a refusal
 * costs no request. Every chip counts, a failed one too, since it still waits to be retried or removed.
 */
export function check(
  file: PickedFile,
  pending: readonly PendingFile[],
  policy: FilePolicy,
): FileProblem | undefined {
  if (!policy.available) return { kind: 'storageNotConfigured' };
  if (pending.length >= policy.maxFiles) return { kind: 'tooMany', max: policy.maxFiles };
  if (file.size <= 0) return { kind: 'empty' };
  if (file.size > policy.maxFileBytes) return { kind: 'tooLarge', maxBytes: policy.maxFileBytes };
  const total = pending.reduce((sum, item) => sum + item.size, 0);
  if (total + file.size > policy.maxMessageBytes)
    return { kind: 'messageTooLarge', maxBytes: policy.maxMessageBytes };
  const type = typeOf(file, policy);
  if (type !== undefined && !policy.types.includes(type))
    return { kind: 'typeNotAllowed', types: policy.types };
  return undefined;
}

export const FILE_TOO_LARGE = 'file_too_large';
export const FILE_TYPE_NOT_ALLOWED = 'file_type_not_allowed';
export const UPLOAD_QUOTA = 'upload_quota';
export const STORAGE_NOT_CONFIGURED = 'file_storage_not_configured';
export const STORAGE_UNAVAILABLE = 'file_storage_unavailable';
/** Not the server's: the bytes it stored differ from the ones sent. */
export const FILE_INTEGRITY_FAILED = 'file_integrity_failed';
/** Not the server's: the picked file could not be read, or changed while it was sent. */
export const FILE_UNREADABLE = 'file_unreadable';

/** A refusal of the file itself (its size, its type, a quota, the storage), with the server's code. */
export class FileRefused extends Error {
  override readonly name = 'FileRefused';
  readonly code: string | undefined;
  /** 0 for a refusal made here (unreadable, integrity). */
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: string | undefined, status: number, retryAfterSeconds?: number) {
    super(code ?? `HTTP ${String(status)}`);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function transientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/** The problem a refusal of the file names. */
export function refusal(error: FileRefused, policy: FilePolicy): FileProblem {
  switch (error.code) {
    case FILE_TOO_LARGE:
      return { kind: 'tooLarge', maxBytes: policy.maxFileBytes };
    case FILE_TYPE_NOT_ALLOWED:
      return { kind: 'typeNotAllowed', types: policy.types };
    case UPLOAD_QUOTA:
      return { kind: 'quota', retryAfterSeconds: error.retryAfterSeconds };
    case STORAGE_NOT_CONFIGURED:
      return { kind: 'storageNotConfigured' };
    case STORAGE_UNAVAILABLE:
      return { kind: 'storageUnavailable' };
    case FILE_INTEGRITY_FAILED:
      return { kind: 'integrity' };
    case FILE_UNREADABLE:
      return { kind: 'unreadable' };
    case 'empty_file':
      return { kind: 'empty' };
    case 'cloud_permission_denied':
    case 'forbidden':
      return { kind: 'denied' };
    case undefined:
    default:
      return error.status === 403
        ? { kind: 'denied' }
        : { kind: 'other', code: error.code, transient: transientStatus(error.status) };
  }
}

/** What an upload that failed ends with: never an exception. */
export function problemOf(error: unknown, policy: FilePolicy): FileProblem {
  if (error instanceof FileRefused) return refusal(error, policy);
  if (!isApiFailure(error)) return { kind: 'other', code: undefined, transient: false };
  if (error.kind === 'network') return { kind: 'unreachable' };
  if (error.status === 404) return { kind: 'sessionGone' };
  const status = error.status ?? 0;
  return { kind: 'other', code: error.code, transient: status >= 500 || status === 408 };
}

/** A size as `512 B`, `245 KB` or `1.2 MB` (powers of 1024), as the CLI words it. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${String(Math.floor((bytes * 10 + 512 * 1024) / (1024 * 1024)) / 10)} MB`;
  if (bytes >= 1024) return `${String(Math.floor(bytes / 1024))} KB`;
  return `${String(bytes)} B`;
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'application/pdf': 'PDF',
  'text/plain': 'text',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
  'application/json': 'JSON',
};

/** The types an organization takes, by their common names: `PNG, JPEG, PDF, text`. */
export function typesLabel(types: readonly string[]): string {
  return types.map((type) => TYPE_LABELS[type] ?? type).join(', ');
}

/** A wait as `2 h`, `5 min` or `30 s`. */
export function waitLabel(seconds: number): string {
  if (seconds >= 3600) return `${String(Math.floor((seconds + 1800) / 3600))} h`;
  if (seconds >= 60) return `${String(Math.floor((seconds + 30) / 60))} min`;
  return `${String(seconds)} s`;
}

/** The reasons a message with files is refused, by the server's code. */
const MESSAGE_REASONS: Readonly<Record<string, 'unavailable' | 'tooLarge' | 'unsupported' | 'invalid'>> = {
  file_unavailable: 'unavailable',
  files_too_large: 'tooLarge',
  files_unsupported: 'unsupported',
  invalid_files: 'invalid',
};

/** The worded reason a message's files were refused for, undefined for any other reason. */
export function messageFilesReason(
  reason: string,
): 'unavailable' | 'tooLarge' | 'unsupported' | 'invalid' | undefined {
  return MESSAGE_REASONS[reason];
}
