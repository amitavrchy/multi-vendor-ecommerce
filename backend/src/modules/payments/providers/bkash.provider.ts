import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CreateIntentInput, PaymentProvider } from '../provider';
export class BkashProvider implements PaymentProvider {
  reconciliationBody(paymentID: string) {
    return { paymentID };
  }
  code = 'BKASH';
  supportsPartialRefund = true;
  available = !!(
    process.env.BKASH_APP_KEY &&
    process.env.BKASH_APP_SECRET &&
    process.env.BKASH_USERNAME &&
    process.env.BKASH_PASSWORD &&
    process.env.BKASH_BASE_URL
  );
  private tokenValue?: { value: string; expires: number };
  private async token() {
    if (this.tokenValue && this.tokenValue.expires > Date.now()) return this.tokenValue.value;
    if (!this.available) throw new ServiceUnavailableException('bKash is not configured');
    const r = await fetch(`${process.env.BKASH_BASE_URL}/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: process.env.BKASH_USERNAME!,
        password: process.env.BKASH_PASSWORD!,
      },
      body: JSON.stringify({
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (!r.ok || !d.id_token) throw new ServiceUnavailableException('bKash authentication failed');
    this.tokenValue = {
      value: d.id_token,
      expires: Date.now() + (Number(d.expires_in || 3600) - 60) * 1000,
    };
    return d.id_token as string;
  }
  private async call(path: string, body: unknown) {
    const r = await fetch(`${process.env.BKASH_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: await this.token(),
        'X-App-Key': process.env.BKASH_APP_KEY!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (!r.ok) throw new ServiceUnavailableException('bKash request failed');
    return d;
  }
  async createIntent(i: CreateIntentInput) {
    const d = await this.call('/create', {
      mode: '0011',
      payerReference: i.email.slice(0, 50),
      callbackURL: `${process.env.APP_URL}/api/payments/webhooks/BKASH`,
      amount: (i.amountMinor / 100).toFixed(2),
      currency: i.currency,
      intent: 'sale',
      merchantInvoiceNumber: i.orderId,
    });
    if (d.statusCode !== '0000' || !d.paymentID || !d.bkashURL)
      throw new ServiceUnavailableException('bKash checkout could not be started');
    return {
      providerRef: d.paymentID as string,
      redirectUrl: d.bkashURL as string,
      status: 'REQUIRES_ACTION' as const,
    };
  }
  callbackReference(body: unknown) {
    const b = body as Record<string, unknown>;
    if (typeof b.paymentID !== 'string' || b.paymentID.length > 160)
      throw new BadRequestException('Invalid payment ID');
    return b.paymentID;
  }
  async parseWebhook(
    _raw: Buffer,
    _headers: Record<string, unknown>,
    body: unknown,
    expected?: { orderId: string; amountMinor: number },
  ) {
    if (!expected) throw new BadRequestException('Unknown bKash payment');
    const paymentID = this.callbackReference(body);
    let d = await this.call('/payment/status', { paymentID });
    if (d.transactionStatus !== 'Completed') {
      try {
        await this.call('/execute', { paymentID });
      } catch {
        /* Query authoritative state after uncertain execute. */
      }
      d = await this.call('/payment/status', { paymentID });
    }
    if (
      d.paymentID !== paymentID ||
      d.currency !== 'BDT' ||
      d.merchantInvoiceNumber !== expected.orderId ||
      Math.round(Number(d.amount) * 100) !== expected.amountMinor
    )
      throw new BadRequestException('bKash payment verification mismatch');
    if (!['Completed', 'Cancelled', 'Failed'].includes(d.transactionStatus))
      throw new ServiceUnavailableException('bKash payment is still pending; do not pay again');
    return {
      eventId: `${paymentID}:${d.transactionStatus}`,
      providerRef: paymentID,
      status: d.transactionStatus === 'Completed' ? ('SUCCEEDED' as const) : ('FAILED' as const),
      amountMinor: expected.amountMinor,
      refundRef: d.trxID as string | undefined,
    };
  }
  async refund(ref: string, amountMinor: number, key: string) {
    return { providerRef: `bkash_manual:${ref}:${key}:${amountMinor}`, status: 'PENDING' as const };
  }
}
