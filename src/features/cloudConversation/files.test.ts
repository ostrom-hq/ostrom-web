// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import {
  canAttach,
  check,
  type FilePolicy,
  FileRefused,
  messageFilesReason,
  NO_FILES,
  type PendingFile,
  policyOf,
  problemOf,
  progressOf,
  retryable,
  sizeLabel,
  typeFor,
  typeOf,
  typesLabel,
  uploadedOf,
  uploading,
  waitLabel,
} from './files';

const TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
];

function policy(change: Partial<FilePolicy> = {}): FilePolicy {
  return {
    available: true,
    reason: undefined,
    maxFileBytes: 20 * 1024 * 1024,
    maxMessageBytes: 25 * 1024 * 1024,
    maxFiles: 5,
    types: TYPES,
    ...change,
  };
}

function picked(name: string, size = 100, type?: string): { name: string; size: number; type?: string } {
  return type === undefined ? { name, size } : { name, size, type };
}

function pending(count: number, size = 100): PendingFile[] {
  return Array.from({ length: count }, (_, index) => ({
    localId: `l${String(index)}`,
    name: `f${String(index)}.png`,
    size,
    state: 'uploaded',
    sent: size,
    uploaded: { id: `f${String(index)}`, name: `f${String(index)}.png`, size, contentType: 'image/png' },
    problem: undefined,
  }));
}

/** TeamCode's SessionFileUseCasesTest: the checks before an upload and the problems an upload ends with. */
describe('the files of a message (TeamCode SessionFilesUseCase)', () => {
  it('reads the policy, a message carrying five files at most whatever the organization says', () => {
    const read = policyOf({
      available: false,
      reason: 'file_storage_not_configured',
      maxFileBytes: 10,
      maxMessageBytes: 20,
      maxFilesPerMessage: 50,
      types: ['image/png'],
    });
    expect(read).toEqual({
      available: false,
      reason: 'file_storage_not_configured',
      maxFileBytes: 10,
      maxMessageBytes: 20,
      maxFiles: 5,
      types: ['image/png'],
    });
    expect(
      policyOf({ available: true, maxFileBytes: 1, maxMessageBytes: 1, maxFilesPerMessage: 0, types: [] })
        .maxFiles,
    ).toBe(1);
    expect(check(picked('a.png'), pending(5), policy({ maxFiles: 5 }))).toEqual({ kind: 'tooMany', max: 5 });
    expect(check(picked('a.png'), pending(4), policy())).toBeUndefined();
    expect(check(picked('a.png'), pending(2), policy({ maxFiles: 2 }))).toEqual({ kind: 'tooMany', max: 2 });
  });

  it('checks sizes and types before any upload', () => {
    const team = policy({ maxFileBytes: 1_000, maxMessageBytes: 1_500, types: ['image/png', 'text/plain'] });
    expect(check(picked('a.png', 0), [], team)).toEqual({ kind: 'empty' });
    expect(check(picked('a.png', 1_001), [], team)).toEqual({ kind: 'tooLarge', maxBytes: 1_000 });
    expect(check(picked('a.png', 600), pending(1, 1_000), team)).toEqual({
      kind: 'messageTooLarge',
      maxBytes: 1_500,
    });
    expect(check(picked('a.pdf'), [], team)).toEqual({ kind: 'typeNotAllowed', types: team.types });
    // The browser's type when the name says nothing; any text type goes as plain text.
    expect(check(picked('scan', 100, 'application/vnd.ms-excel'), [], team)).toEqual({
      kind: 'typeNotAllowed',
      types: team.types,
    });
    expect(check(picked('build.log', 100, 'text/x-log'), [], team)).toBeUndefined();
    expect(typeOf(picked('build.log', 100, 'text/x-log; charset=utf-8'), team)).toBe('text/plain');
    expect(typeOf(picked('build.log', 100, 'text/x-log'), policy({ types: ['image/png'] }))).toBe(
      'text/x-log',
    );
    expect(typeOf(picked('notes.TXT', 100, 'text/csv'), team)).toBe('text/plain');
    // Nothing says: the server recognizes the bytes.
    expect(typeOf(picked('blob', 100, 'application/octet-stream'), team)).toBeUndefined();
    expect(typeOf(picked('blob', 100, ''), team)).toBeUndefined();
    expect(check(picked('blob'), [], team)).toBeUndefined();
    expect(check(picked('a.png'), [], policy({ available: false }))).toEqual({
      kind: 'storageNotConfigured',
    });
  });

  it('guesses a type by extension only', () => {
    expect(typeFor('a.JPEG')).toBe('image/jpeg');
    expect(typeFor('README.markdown')).toBe('text/markdown');
    expect(typeFor('.png')).toBeUndefined();
    expect(typeFor('archive.')).toBeUndefined();
    expect(typeFor('noext')).toBeUndefined();
    expect(typeFor('a.exe')).toBeUndefined();
  });

  it('turns each refusal into its problem', () => {
    const team = policy({ maxFileBytes: 1_000 });
    const of = (code: string | undefined, status: number, retryAfter?: number): unknown =>
      problemOf(new FileRefused(code, status, retryAfter), team);
    expect(of('file_too_large', 413)).toEqual({ kind: 'tooLarge', maxBytes: 1_000 });
    expect(of('file_type_not_allowed', 415)).toEqual({ kind: 'typeNotAllowed', types: team.types });
    expect(of('upload_quota', 429, 3600)).toEqual({ kind: 'quota', retryAfterSeconds: 3600 });
    expect(of('file_storage_not_configured', 409)).toEqual({ kind: 'storageNotConfigured' });
    expect(of('file_storage_unavailable', 503)).toEqual({ kind: 'storageUnavailable' });
    expect(of('file_integrity_failed', 0)).toEqual({ kind: 'integrity' });
    expect(of('file_unreadable', 0)).toEqual({ kind: 'unreadable' });
    expect(of('empty_file', 400)).toEqual({ kind: 'empty' });
    expect(of('cloud_permission_denied', 403)).toEqual({ kind: 'denied' });
    expect(of('forbidden', 403)).toEqual({ kind: 'denied' });
    expect(of('anything', 403)).toEqual({ kind: 'denied' });
    expect(of('whatever', 400)).toEqual({ kind: 'other', code: 'whatever', transient: false });
    expect(of(undefined, 502)).toEqual({ kind: 'other', code: undefined, transient: true });
    expect(of('slow', 408)).toEqual({ kind: 'other', code: 'slow', transient: true });
    expect(of('busy', 429)).toEqual({ kind: 'other', code: 'busy', transient: true });
    expect(of('file_upload_in_progress', 409)).toEqual({
      kind: 'other',
      code: 'file_upload_in_progress',
      transient: true,
    });
    expect(of('conflict', 409)).toEqual({ kind: 'other', code: 'conflict', transient: false });
    expect(new FileRefused(undefined, 500).message).toBe('HTTP 500');
    const failure = (kind: ApiFailure['kind'], status: number | undefined, code?: string): unknown =>
      problemOf(new ApiFailure(kind, 'x', status, undefined, code), team);
    expect(failure('not-found', 404)).toEqual({ kind: 'sessionGone' });
    expect(failure('network', undefined)).toEqual({ kind: 'unreachable' });
    expect(failure('server', 502, 'bad_gateway')).toEqual({
      kind: 'other',
      code: 'bad_gateway',
      transient: true,
    });
    expect(failure('unexpected', 408)).toEqual({ kind: 'other', code: undefined, transient: true });
    expect(failure('unauthorized', 401)).toEqual({ kind: 'other', code: undefined, transient: false });
    expect(failure('unexpected', undefined)).toEqual({ kind: 'other', code: undefined, transient: false });
    expect(problemOf(new Error('boom'), team)).toEqual({ kind: 'other', code: undefined, transient: false });
  });

  it('retries only what may pass', () => {
    expect(retryable({ kind: 'quota', retryAfterSeconds: 3600 })).toBe(true);
    expect(retryable({ kind: 'quota', retryAfterSeconds: undefined })).toBe(false);
    expect(retryable({ kind: 'unreachable' })).toBe(true);
    expect(retryable({ kind: 'storageUnavailable' })).toBe(true);
    expect(retryable({ kind: 'integrity' })).toBe(true);
    expect(retryable({ kind: 'other', code: undefined, transient: true })).toBe(true);
    for (const kind of [
      'empty',
      'unreadable',
      'storageNotConfigured',
      'denied',
      'unsupported',
      'sessionGone',
    ] as const)
      expect(retryable({ kind })).toBe(false);
    expect(retryable({ kind: 'tooMany', max: 5 })).toBe(false);
    expect(retryable({ kind: 'tooLarge', maxBytes: 1 })).toBe(false);
    expect(retryable({ kind: 'messageTooLarge', maxBytes: 1 })).toBe(false);
    expect(retryable({ kind: 'typeNotAllowed', types: [] })).toBe(false);
  });

  it('says what the composer may do with its files', () => {
    expect(canAttach(NO_FILES)).toBe(false);
    expect(canAttach({ ...NO_FILES, policy: policy() })).toBe(true);
    expect(canAttach({ ...NO_FILES, policy: policy({ available: false }) })).toBe(false);
    expect(canAttach({ ...NO_FILES, policy: policy(), files: pending(5) })).toBe(false);
    const [first, second] = pending(2);
    if (first === undefined || second === undefined) throw new Error('two files');
    const sending: PendingFile = { ...second, state: 'uploading', sent: 25, uploaded: undefined };
    expect(uploading({ ...NO_FILES, files: [first, sending] })).toBe(true);
    expect(uploading({ ...NO_FILES, files: [first] })).toBe(false);
    expect(uploadedOf([first, sending])).toBeUndefined();
    expect(uploadedOf([first])).toEqual([first.uploaded]);
    expect(uploadedOf([])).toEqual([]);
    expect(progressOf(sending)).toBe(0.25);
    expect(progressOf({ ...sending, size: 0 })).toBe(0);
    expect(progressOf({ ...sending, sent: 500 })).toBe(1);
  });

  it('words sizes, types, waits and the refusals of a message', () => {
    expect(sizeLabel(512)).toBe('512 B');
    expect(sizeLabel(245 * 1024 + 3)).toBe('245 KB');
    expect(sizeLabel(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(sizeLabel(20 * 1024 * 1024)).toBe('20 MB');
    expect(typesLabel(['image/png', 'application/pdf', 'text/plain', 'application/x-thing'])).toBe(
      'PNG, PDF, text, application/x-thing',
    );
    expect(waitLabel(5_400)).toBe('2 h');
    expect(waitLabel(300)).toBe('5 min');
    expect(waitLabel(30)).toBe('30 s');
    expect(messageFilesReason('file_unavailable')).toBe('unavailable');
    expect(messageFilesReason('files_too_large')).toBe('tooLarge');
    expect(messageFilesReason('files_unsupported')).toBe('unsupported');
    expect(messageFilesReason('invalid_files')).toBe('invalid');
    expect(messageFilesReason('delivery_failed')).toBeUndefined();
  });
});
