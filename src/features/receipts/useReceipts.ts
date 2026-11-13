// SPDX-License-Identifier: Apache-2.0
import {
  getReceiptOptions,
  listReceiptsOptions,
  verifyReceiptOptions,
} from '@gen/api/@tanstack/react-query.gen';
import { client } from '@gen/api/client.gen';
import type { GetReceiptBundleData, Receipt, Verification } from '@gen/api/types.gen';
import { useMutation, useQuery } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { saveFile } from '@/shared/lib/saveFile';

export interface ReceiptListViewModel {
  readonly receipts: readonly Receipt[] | undefined;
  readonly failure: Error | undefined;
}

export function useReceiptList(): ReceiptListViewModel {
  const query = useQuery(ready(listReceiptsOptions()));
  return { receipts: query.data?.items, failure: failureOf(query.error) };
}

export interface ReceiptViewModel {
  readonly receipt: Receipt | undefined;
  readonly failure: Error | undefined;
  /** The server's check of the signature with its own keys; `undefined` while it runs. */
  readonly verification: Verification | undefined;
  readonly verificationFailure: Error | undefined;
  /** Downloads the receipt with every signed piece it cites, for `ostrom verify` offline. */
  readonly download: () => void;
  readonly downloading: boolean;
  readonly downloadFailure: Error | undefined;
}

/**
 * The bundle as the server signed it, byte for byte: fetched with the session cookie (a link cannot carry it to
 * another origin) and never parsed, since a parse would drop what the contract does not name and break the check.
 */
async function bundleOf(id: string): Promise<Blob> {
  const { data } = await client.get<{ 200: Blob }, unknown, true>({
    url: '/api/v1/receipts/{id}/bundle' satisfies GetReceiptBundleData['url'],
    path: { id } satisfies GetReceiptBundleData['path'],
    parseAs: 'blob',
    throwOnError: true,
  });
  return data;
}

/** A receipt never changes once signed: it is read once and kept. */
export function useReceipt(id: string): ReceiptViewModel {
  const receipt = useQuery(ready(getReceiptOptions({ path: { id } }), { staleTime: Infinity }));
  const verification = useQuery(ready(verifyReceiptOptions({ path: { id } }), { staleTime: Infinity }));
  const bundle = useMutation({
    mutationFn: async () => bundleOf(id),
    onSuccess: (blob) => {
      saveFile(blob, `${id}.json`);
    },
  });
  const { mutate } = bundle;
  return {
    receipt: receipt.data,
    failure: failureOf(receipt.error),
    verification: verification.data,
    verificationFailure: failureOf(verification.error),
    download: () => {
      mutate();
    },
    downloading: bundle.isPending,
    downloadFailure: failureOf(bundle.error),
  };
}
