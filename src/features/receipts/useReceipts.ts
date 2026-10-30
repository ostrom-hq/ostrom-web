// SPDX-License-Identifier: AGPL-3.0-only
import {
  getReceiptOptions,
  listReceiptsOptions,
  verifyReceiptOptions,
} from '@gen/api/@tanstack/react-query.gen';
import { client } from '@gen/api/client.gen';
import type { GetReceiptBundleData, Receipt, Verification } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { tuned } from '@/shared/api/tuned';

export interface ReceiptListViewModel {
  readonly receipts: readonly Receipt[] | undefined;
  readonly failure: Error | undefined;
}

export function useReceiptList(): ReceiptListViewModel {
  const query = useQuery(listReceiptsOptions());
  return { receipts: query.data?.items, failure: failureOf(query.error) };
}

export interface ReceiptViewModel {
  readonly receipt: Receipt | undefined;
  readonly failure: Error | undefined;
  /** The server's check of the signature with its own keys; `undefined` while it runs. */
  readonly verification: Verification | undefined;
  readonly verificationFailure: Error | undefined;
  /** The receipt with every signed piece it cites, for `ostrom verify` offline. */
  readonly bundleUrl: string;
}

/** A receipt never changes once signed: it is read once and kept. */
export function useReceipt(id: string): ReceiptViewModel {
  const receipt = useQuery(tuned(getReceiptOptions({ path: { id } }), { staleTime: Infinity }));
  const verification = useQuery(tuned(verifyReceiptOptions({ path: { id } }), { staleTime: Infinity }));
  return {
    receipt: receipt.data,
    failure: failureOf(receipt.error),
    verification: verification.data,
    verificationFailure: failureOf(verification.error),
    bundleUrl: client.buildUrl<GetReceiptBundleData>({ url: '/api/v1/receipts/{id}/bundle', path: { id } }),
  };
}
