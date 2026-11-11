export interface CreateIntentInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  email: string;
}
export interface IntentResult {
  metadata?: Record<string, string>;
  providerRef: string;
  redirectUrl?: string;
  clientSecret?: string;
  instructions?: string;
  status: 'REQUIRES_ACTION' | 'COD_PENDING';
}
export interface NormalizedEvent {
  refundRef?: string;
  eventId: string;
  providerRef: string;
  status: 'SUCCEEDED' | 'FAILED';
  amountMinor: number;
}
export interface PaymentProvider {
  reconciliationBody?(ref: string): unknown;
  callbackReference?(body: unknown): string;
  code: string;
  supportsPartialRefund: boolean;
  available: boolean;
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  parseWebhook(
    raw: Buffer,
    headers: Record<string, unknown>,
    body: unknown,
    expected?: { orderId: string; amountMinor: number; metadata?: Record<string, string> },
  ): Promise<NormalizedEvent>;
  refund(
    ref: string,
    amountMinor: number,
    key: string,
  ): Promise<{ providerRef: string; status?: 'PENDING' | 'SUCCEEDED' }>;
}
