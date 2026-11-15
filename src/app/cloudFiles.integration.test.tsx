// SPDX-License-Identifier: Apache-2.0
import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { zSendCloudMessageRequest } from '@gen/api/zod.gen';
import { demoCapabilities } from '@/mocks/capabilities';
import { CONVERSATION_ID } from '@/mocks/cloudConversation';
import { FEATURES } from '@/shared/capabilities/model';
import { FetchXhr } from '@/test/fetchXhr';
import { held } from '@/test/handlerFetch';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

const PATH = `/cloud/sessions/${CONVERSATION_ID}`;
const FILES = '*/api/v1/cloud/sessions/:id/files';
const MESSAGES = '*/api/v1/cloud/sessions/:id/messages';
const ERROR = (status: number, type: string, headers: Record<string, string> = {}): Response =>
  HttpResponse.json({ error: { type, message: type } }, { status, headers });

/** The bytes a PNG starts with: the demo's server recognizes it by them. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function png(name: string): File {
  return new File([PNG], name, { type: 'image/png' });
}

function text(name: string, content = 'some notes'): File {
  return new File([content], name, { type: 'text/plain' });
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FetchXhr);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function withoutFiles(): void {
  server.use(
    http.get('*/api/v1/capabilities', () =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'runners.cloud.files.v1'))),
    ),
  );
}

/** The bodies of the messages sent, in order. */
function sentMessages(): ReturnType<typeof zSendCloudMessageRequest.parse>[] {
  const sent: ReturnType<typeof zSendCloudMessageRequest.parse>[] = [];
  traffic.onRequest((request) => {
    if (request.method === 'POST' && request.url.endsWith('/messages'))
      void request
        .clone()
        .json()
        .then((body: unknown) => sent.push(zSendCloudMessageRequest.parse(body)));
  });
  return sent;
}

/** The idempotency keys of the uploads, in order. */
function uploadKeys(): (string | null)[] {
  const keys: (string | null)[] = [];
  traffic.onRequest((request) => {
    if (request.method === 'POST' && request.url.includes('/files?'))
      keys.push(request.headers.get('Idempotency-Key'));
  });
  return keys;
}

async function opened(): Promise<HTMLElement> {
  visit(PATH);
  const transcript = await screen.findByRole('region', { name: 'Conversation' });
  await within(transcript).findByText('Why does the invoice test fail on Mondays?');
  return transcript;
}

function picker(): HTMLInputElement {
  const input = screen.getByLabelText('Attach files');
  if (!(input instanceof HTMLInputElement)) throw new Error('the file input');
  return input;
}

function pick(...files: File[]): void {
  fireEvent.change(picker(), { target: { files } });
}

function sendButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Send' });
}

function chips(): HTMLElement {
  return screen.getByRole('list', { name: 'Files of the next message' });
}

/** TeamCode's SessionFilesTest: the capability, the upload and its progress, retries, the cap, and the message. */
describe('the files of a conversation’s next message (TeamCode SessionFiles)', () => {
  it('shows no paperclip and asks nothing without the capability; messages go as before', async () => {
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    const sent = sentMessages();
    withoutFiles();
    const user = userEvent.setup();
    const transcript = await opened();
    expect(screen.queryByRole('button', { name: 'Attach files' })).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Message the agent' }), 'hello');
    await user.click(sendButton());
    expect(await within(transcript).findByText('On it: hello')).toBeInTheDocument();
    expect(sent[0]?.fileIds).toBeUndefined();
    expect(asked).not.toContain('/api/v1/cloud/files/policy');
  });

  it('explains files that are off for the organization instead of opening a picker', async () => {
    db.cloudFilePolicy = { ...db.cloudFilePolicy, available: false, reason: 'file_storage_not_configured' };
    const user = userEvent.setup();
    await opened();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    await user.click(await screen.findByRole('button', { name: 'Attach files' }));
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Files are off for this organization: an administrator has to configure and test its artifact storage first.',
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    // A file dropped anyway is refused the same way, never uploaded.
    pick(png('a.png'));
    expect(screen.getByRole('alert')).toHaveTextContent('Files are off for this organization');
    // A dialog closed without a file hands nothing.
    fireEvent.change(picker(), { target: { files: null } });
  });

  it('opens the browser’s dialog from the paperclip', async () => {
    const user = userEvent.setup();
    await opened();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    await user.click(await screen.findByRole('button', { name: 'Attach files' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('uploads a file with its progress, then sends it with the message', async () => {
    const user = userEvent.setup();
    const sent = sentMessages();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    server.use(
      http.post(FILES, async () => {
        if (first) {
          first = false;
          await held(gate);
        }
        return undefined;
      }),
    );
    const transcript = await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    pick(png('shot.png'));
    const chip = within(chips()).getByRole('listitem');
    expect(within(chip).getByText('shot.png')).toBeInTheDocument();
    expect(await within(chip).findByText('12 B of 12 B')).toBeInTheDocument();
    expect(within(chip).getByRole('progressbar', { name: 'shot.png' })).toBeInTheDocument();
    // Send waits for the upload.
    await user.type(screen.getByRole('textbox', { name: 'Message the agent' }), 'What is in it?');
    expect(sendButton()).toBeDisabled();
    fireEvent.submit(sendButton());
    expect(
      await screen.findByText('Wait until every file is uploaded, or remove the ones that failed.'),
    ).toBeVisible();
    release();
    expect(await within(chip).findByText('Uploaded · 12 B')).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
    await user.click(sendButton());
    expect(await within(transcript).findByText('Read shot.png.')).toBeInTheDocument();
    expect(within(transcript).getByText('shot.png (12 B)')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({ text: 'What is in it?', fileIds: ['file-1'] });
    // The composer starts over.
    expect(screen.queryByRole('list', { name: 'Files of the next message' })).toBeNull();
  });

  it('sends files alone, without text', async () => {
    const user = userEvent.setup();
    const sent = sentMessages();
    const transcript = await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    expect(sendButton()).toBeDisabled();
    pick(png('a.png'), text('b.md'));
    await waitFor(() => {
      expect(within(chips()).getAllByText(/^Uploaded/)).toHaveLength(2);
    });
    await user.click(sendButton());
    expect(await within(transcript).findByText('Read a.png, b.md.')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({ text: '', fileIds: ['file-1', 'file-2'] });
  });

  it('retries a failed message with its files, and says why one is refused for them', async () => {
    const user = userEvent.setup();
    const sent = sentMessages();
    server.use(http.post(MESSAGES, () => ERROR(503, 'unavailable'), { once: true }));
    const transcript = await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    pick(png('a.png'));
    await within(chips()).findByText(/^Uploaded/);
    await user.click(sendButton());
    expect(await screen.findByText('Not sent: unavailable')).toBeInTheDocument();
    // The message on its way shows its files.
    expect(screen.getByText('a.png (12 B)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await within(transcript).findByText('Read a.png.')).toBeInTheDocument();
    expect(sent.map((body) => body.fileIds)).toEqual([['file-1'], ['file-1']]);
    expect(sent[1]?.clientMessageId).toBe(sent[0]?.clientMessageId);

    // Another file the server no longer has to give.
    server.use(http.post(MESSAGES, () => ERROR(409, 'file_unavailable'), { once: true }));
    pick(png('c.png'));
    await within(chips()).findByText(/^Uploaded/);
    await user.click(sendButton());
    expect(
      await screen.findByText(
        'Refused: an attached file is no longer available (sent already, or expired after 24 hours). Attach it again.',
      ),
    ).toBeInTheDocument();
  });

  it('retries a failed upload under the same key; a refusal of the file offers removal only', async () => {
    const user = userEvent.setup();
    const keys = uploadKeys();
    server.use(http.post(FILES, () => ERROR(429, 'upload_quota', { 'Retry-After': '120' }), { once: true }));
    await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    pick(png('a.png'));
    expect(
      await within(chips()).findByText('Your daily upload quota is used up; try again in 2 min.'),
    ).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    await user.click(within(chips()).getByRole('button', { name: 'Retry' }));
    expect(await within(chips()).findByText(/^Uploaded/)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);

    // The server stored other bytes: a retry goes under a new key, or it would replay them.
    server.use(
      http.post(
        FILES,
        () =>
          HttpResponse.json(
            {
              id: 'file-bad',
              sessionId: CONVERSATION_ID,
              name: 'x.png',
              size: 1,
              contentType: 'image/png',
              sha256: 'ab',
              createdAt: '2026-10-30T09:00:00.000Z',
              expiresAt: '2026-10-31T09:00:00.000Z',
            },
            { status: 201 },
          ),
        { once: true },
      ),
    );
    pick(png('x.png'));
    const corrupt = await within(chips()).findByText(
      'The server stored other bytes than the ones sent. Try again.',
    );
    const corruptChip = corrupt.closest('li');
    if (corruptChip === null) throw new Error('the chip');
    await user.click(within(corruptChip).getByRole('button', { name: 'Retry' }));
    await within(corruptChip).findByText(/^Uploaded/);
    expect(keys).toHaveLength(4);
    expect(keys[3]).not.toBe(keys[2]);

    server.use(http.post(FILES, () => ERROR(415, 'file_type_not_allowed'), { once: true }));
    pick(png('b.png'));
    const refused = await within(chips()).findByText(
      'The organization takes PNG, JPEG, WebP, GIF, PDF, text, Markdown, CSV, JSON; the content decides, not the name.',
    );
    const chip = refused.closest('li');
    if (chip === null) throw new Error('the chip');
    expect(within(chip).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(sendButton()).toBeDisabled();
    // Removing it lets the message go with the other.
    await user.click(within(chip).getByRole('button', { name: 'Remove b.png' }));
    expect(sendButton()).toBeEnabled();
  });

  it('says each refusal of an upload', async () => {
    await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    const cases: [Response, string][] = [
      [ERROR(429, 'upload_quota'), 'This session holds too many files not sent yet'],
      [ERROR(413, 'file_too_large'), 'The organization allows 20 MB per file.'],
      [ERROR(409, 'file_storage_not_configured'), 'Files are off for this organization'],
      [ERROR(400, 'empty_file'), 'This file is empty.'],
      [ERROR(403, 'cloud_permission_denied'), 'You may not send files to this session.'],
      [ERROR(404, 'not_found'), 'This session no longer exists, or you can no longer see it.'],
      [ERROR(400, 'invalid_file_name'), 'The upload was refused (invalid_file_name).'],
      [new HttpResponse('nope', { status: 400 }), 'The upload was refused (error).'],
    ];
    for (const [answer, words] of cases) {
      server.use(http.post(FILES, () => answer.clone(), { once: true }));
      pick(text('n.txt'));
      const said = await within(chips()).findByText(new RegExp(words.replace(/[.()]/g, '\\$&')));
      const chip = said.closest('li');
      if (chip === null) throw new Error('the chip');
      fireEvent.click(within(chip).getByRole('button', { name: 'Remove n.txt' }));
    }
  });

  it('refuses a sixth file, one too large or of a type not taken, before any upload', async () => {
    const user = userEvent.setup();
    const keys = uploadKeys();
    db.cloudFilePolicy = { ...db.cloudFilePolicy, maxFileBytes: 100, types: ['image/png', 'text/plain'] };
    await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    pick(...['1', '2', '3', '4', '5', '6'].map((name) => png(`f${name}.png`)));
    expect(within(chips()).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A message carries 5 files at most: send this one first, or remove a file.',
    );
    await waitFor(() => {
      expect(keys).toHaveLength(5);
    });
    // The paperclip says so too.
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await user.click(screen.getByRole('button', { name: 'Attach files' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A message carries 5 files at most');
    await user.click(screen.getByRole('button', { name: 'Remove f1.png' }));
    pick(text('big.txt', 'x'.repeat(101)));
    expect(screen.getByRole('alert')).toHaveTextContent('The organization allows 100 B per file.');
    pick(new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The organization takes PNG, text;');
    pick(new File([], 'empty.txt'));
    expect(screen.getByRole('alert')).toHaveTextContent('This file is empty.');
    expect(keys).toHaveLength(5);
  });

  it('refuses a file that would make the message too large', async () => {
    db.cloudFilePolicy = { ...db.cloudFilePolicy, maxMessageBytes: 20 };
    await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    pick(png('a.png'), png('b.png'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The organization allows 20 B of files per message: send the files already attached first.',
    );
    expect(within(chips()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('stops an upload when its file is removed', async () => {
    const keys = uploadKeys();
    server.use(
      http.post(FILES, async () => {
        await held(new Promise(() => undefined));
        return undefined;
      }),
    );
    await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    pick(png('a.png'));
    await waitFor(() => {
      expect(keys).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    expect(screen.queryByRole('list', { name: 'Files of the next message' })).toBeNull();
  });

  it('takes files dropped anywhere on the session, and files pasted in the message', async () => {
    await opened();
    await screen.findByRole('button', { name: 'Attach files' });
    const area = screen.getByRole('region', { name: 'Conversation' });
    const transfer = { types: ['Files'], files: [png('dropped.png')] };
    fireEvent.dragOver(area, { dataTransfer: transfer });
    expect(screen.getByText('Drop files to attach them to your next message')).toBeInTheDocument();
    // Leaving for a child is not leaving.
    // jsdom has no DragEvent: the element left for is set by hand.
    const leaving = createEvent.dragLeave(area, { dataTransfer: transfer });
    Object.defineProperty(leaving, 'relatedTarget', { value: area });
    fireEvent(area, leaving);
    expect(screen.getByText('Drop files to attach them to your next message')).toBeInTheDocument();
    fireEvent.dragLeave(area, { dataTransfer: transfer });
    expect(screen.queryByText('Drop files to attach them to your next message')).toBeNull();
    // A drag that carries nothing, or text, is not files.
    fireEvent.dragOver(area, { dataTransfer: null });
    fireEvent.drop(area, { dataTransfer: null });
    fireEvent.dragOver(area, { dataTransfer: { types: ['text/plain'], files: [] } });
    fireEvent.drop(area, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.queryByText('Drop files to attach them to your next message')).toBeNull();
    fireEvent.dragOver(area, { dataTransfer: transfer });
    fireEvent.drop(area, { dataTransfer: transfer });
    expect(await within(chips()).findByText('dropped.png')).toBeInTheDocument();

    const field = screen.getByRole('textbox', { name: 'Message the agent' });
    const paste = (types: string[], files: File[]): void => {
      const event = createEvent.paste(field, { clipboardData: { types, files } });
      fireEvent(field, event);
    };
    paste(['text/plain', 'Files'], [png('rich.png')]);
    paste(['text/plain'], []);
    paste(['Files'], [png('pasted.png')]);
    expect(await within(chips()).findByText('pasted.png')).toBeInTheDocument();
    expect(within(chips()).queryByText('rich.png')).toBeNull();
  });

  it('shows the files a message carried in the transcript', async () => {
    const known = db.cloudEvents[CONVERSATION_ID] ?? [];
    db.cloudEvents[CONVERSATION_ID] = [
      ...known,
      {
        seq: known.length + 1,
        type: 'message.user',
        at: '2026-10-30T09:00:00.000Z',
        epoch: 1,
        data: {
          text: '',
          files: [{ id: 'f9', name: 'trace.log', size: 3 * 1024, contentType: 'text/plain' }],
        },
      },
    ];
    visit(PATH);
    expect(await screen.findByText('trace.log (3 KB)')).toBeInTheDocument();
  });
});
