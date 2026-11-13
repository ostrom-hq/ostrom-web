// SPDX-License-Identifier: AGPL-3.0-only
import { handleAnswerGovernanceConfirmation, handleGetGovernanceConfirmation } from '@gen/api/msw.gen';
import type { ErrorDetail, GovernanceConfirmation, Organization } from '@gen/api/types.gen';
import { zGovernanceConfirmationAnswer, zGovernanceConfirmationAnswerRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { isKnown, knownValues } from '@/shared/lib/openEnum';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { MAYA } from './fixtures/confirmations';
import { FRESH_SIGN_IN_MS, readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** The demo organization's governance confirmations, as ostrom-server keeps them (core#57). */
export interface ConfirmationsState extends OrgsState {
  confirmations: GovernanceConfirmation[];
  /** Confirmations whose `before` is no longer what they change: a confirm writes nothing (`confirmation_stale`). */
  staleConfirmations: string[];
  /** Confirmations whose write is refused once confirmed, with the write's own error. */
  refusedWrites: Record<string, ErrorDetail>;
  /** When the person signed in (ms): a confirm needs it less than five minutes old, as a yes does. */
  signedInAt: number;
}

export function createConfirmationHandlers(
  state: () => ConfirmationsState,
  now: () => Date,
  organizationOf: (request: Request) => Organization,
): HttpHandler[] {
  /** The confirmation in the caller's organization, past its time read as expired; another organization has none. */
  const find = (request: Request, id: string): GovernanceConfirmation | undefined => {
    const db = state();
    if (organizationOf(request).id !== db.organization.id) return undefined;
    const found = db.confirmations.find((item) => item.id === id);
    if (found?.status !== 'pending' || Date.parse(found.expiresAt) > now().getTime()) return found;
    return save({ ...found, status: 'expired' });
  };
  const save = (next: GovernanceConfirmation): GovernanceConfirmation => {
    const db = state();
    db.confirmations = db.confirmations.map((item) => (item.id === next.id ? next : item));
    return next;
  };
  const notFound = () => refusal(404, 'not_found', 'confirmation not found');
  return [
    handleGetGovernanceConfirmation(({ request, params }) => {
      const confirmation = find(request, params.id);
      return confirmation === undefined ? notFound() : HttpResponse.json(confirmation);
    }),
    handleAnswerGovernanceConfirmation(async ({ request, params }) => {
      const db = state();
      const confirmation = find(request, params.id);
      if (confirmation === undefined) return notFound();
      const body = zGovernanceConfirmationAnswerRequest.safeParse(await readJson(request));
      if (!body.success || !isKnown(knownValues(zGovernanceConfirmationAnswer), body.data.answer))
        return refusal(400, 'invalid_request', 'answer must be confirm or refuse');
      const role = orgRoleOf(
        db.orgMembers[db.organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role,
      );
      if (!managesMembers(role))
        return refusal(403, 'forbidden', 'Only an owner or an admin answers a governance confirmation.');
      if (confirmation.status === 'expired')
        return refusal(410, 'confirmation_expired', 'This confirmation expired: nothing was written.');
      if (confirmation.status !== 'pending')
        return refusal(409, 'confirmation_closed', 'This confirmation was already answered.');
      const answered = { answeredBy: MAYA, answeredAt: now().toISOString() };
      if (body.data.answer === 'refuse')
        return HttpResponse.json(save({ ...confirmation, ...answered, status: 'refused' }));
      if (now().getTime() - db.signedInAt > FRESH_SIGN_IN_MS)
        return refusal(
          403,
          'step_up_required',
          'Sign in again to confirm: your sign-in is more than five minutes old.',
        );
      const error: ErrorDetail | undefined = db.staleConfirmations.includes(confirmation.id)
        ? { type: 'confirmation_stale', message: 'What this change replaces changed since it was shown.' }
        : db.refusedWrites[confirmation.id];
      if (error !== undefined) {
        save({ ...confirmation, ...answered, status: 'failed', error });
        return refusal(409, error.type, error.message);
      }
      const confirmed: GovernanceConfirmation = { ...confirmation, ...answered, status: 'confirmed' };
      // A deletion returns nothing; anything else returns what it wrote, as the read routes show it.
      if (confirmation.after !== null) confirmed.result = confirmation.after;
      return HttpResponse.json(save(confirmed));
    }),
  ];
}
