// SPDX-License-Identifier: AGPL-3.0-only
import { handleListAudit } from '@gen/api/msw.gen';
import type { ApiError, AuditEvent } from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';

export interface AuditState {
  /** Newest first, as the server lists them. */
  audit: AuditEvent[];
}

/** Small, so the demo shows the next page; the server's pages hold 50 lines. */
export const AUDIT_PAGE = 5;

/**
 * `GET /audit?before=` as server#131 serves it: newest first, a page at a time, `next` read back as `before` (a cursor
 * no page gave is refused with 400); an owner or an admin only (403 otherwise); another organization's log is never
 * read (an empty one here, the demo's log being Acme's).
 */
export function createAuditHandlers(
  state: () => AuditState,
  inHome: (request: Request) => boolean,
  mayRead: () => boolean,
): HttpHandler[] {
  return [
    handleListAudit(({ request }) => {
      if (!mayRead()) {
        return HttpResponse.json<ApiError>(
          { error: { type: 'forbidden', message: 'Only an owner or an admin reads the audit log.' } },
          { status: 403 },
        );
      }
      if (!inHome(request)) return HttpResponse.json({ items: [] });
      const before = new URL(request.url).searchParams.get('before');
      const { audit } = state();
      const from = before === null ? 0 : audit.findIndex((event) => event.id === before) + 1;
      if (from === 0 && before !== null) {
        return HttpResponse.json<ApiError>(
          { error: { type: 'invalid_request', message: 'The cursor is not one a previous page gave.' } },
          { status: 400 },
        );
      }
      const page = audit.slice(from, from + AUDIT_PAGE);
      const last = page.at(-1);
      return HttpResponse.json({
        items: page,
        ...(audit.length > from + AUDIT_PAGE && last !== undefined ? { next: last.id } : {}),
      });
    }),
  ];
}
