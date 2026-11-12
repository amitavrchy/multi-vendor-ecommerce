export type RefundState = 'SUCCEEDED' | 'PROCESSING' | 'FAILED' | 'MANUAL_REVIEW';

export interface RefundResult {
  providerRef: string;
  status: RefundState;
}

export interface RefundContext {
  paymentRef: string;
  transactionRef?: string;
  amountMinor: number;
  idempotencyKey: string;
}
