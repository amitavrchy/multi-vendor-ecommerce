import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  constants,
  createHash,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { CreateIntentInput, PaymentProvider } from '../provider';
export class NagadProvider implements PaymentProvider {
  reconciliationBody(payment_ref_id: string) {
    return { payment_ref_id };
  }
  code = 'NAGAD';
  supportsPartialRefund = true;
  available = !!(
    process.env.NAGAD_MERCHANT_ID &&
    process.env.NAGAD_PRIVATE_KEY &&
    process.env.NAGAD_PG_PUBLIC_KEY &&
    process.env.NAGAD_BASE_URL
  );
  private pem(value: string, type: string) {
    const v = value.replaceAll('\\n', '\n');
    return v.includes('-----BEGIN') ? v : `-----BEGIN ${type}-----\n${v}\n-----END ${type}-----`;
  }
  private privateKey() {
    return this.pem(process.env.NAGAD_PRIVATE_KEY!, 'RSA PRIVATE KEY');
  }
  private publicKey() {
    return this.pem(process.env.NAGAD_PG_PUBLIC_KEY!, 'PUBLIC KEY');
  }
  private envelope(data: unknown) {
    const value = Buffer.from(JSON.stringify(data));
    return {
      sensitiveData: publicEncrypt(
        { key: this.publicKey(), padding: constants.RSA_PKCS1_PADDING },
        value,
      ).toString('base64'),
      signature: sign('RSA-SHA256', value, this.privateKey()).toString('base64'),
    };
  }
  private decode(data: { sensitiveData: string; signature: string }) {
    try {
      const plain = privateDecrypt(
        { key: this.privateKey(), padding: constants.RSA_PKCS1_PADDING },
        Buffer.from(data.sensitiveData, 'base64'),
      );
      if (!verify('RSA-SHA256', plain, this.publicKey(), Buffer.from(data.signature, 'base64')))
        throw new Error();
      return JSON.parse(plain.toString());
    } catch {
      throw new BadRequestException('Invalid Nagad gateway signature or encrypted response');
    }
  }
  private async call(path: string, body?: unknown) {
    if (!this.available) throw new ServiceUnavailableException('Nagad is not configured');
    const r = await fetch(`${process.env.NAGAD_BASE_URL!.replace(/\/$/, '')}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-KM-Api-Version': 'v-0.2.0',
        'X-KM-Client-Type': 'PC_WEB',
        ...(process.env.NAGAD_SERVER_IP ? { 'X-KM-IP-V4': process.env.NAGAD_SERVER_IP } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (!r.ok) throw new ServiceUnavailableException('Nagad gateway request failed');
    return d;
  }
  async createIntent(i: CreateIntentInput) {
    const gatewayOrderId = createHash('sha256').update(i.orderId).digest('hex').slice(0, 20);
    const dateTime = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(new Date())
      .replace(/\D/g, '');
    const init = await this.call(
      `check-out/initialize/${process.env.NAGAD_MERCHANT_ID}/${gatewayOrderId}`,
      {
        dateTime,
        ...this.envelope({
          merchantId: process.env.NAGAD_MERCHANT_ID,
          dateTime,
          orderId: gatewayOrderId,
          challenge: randomBytes(20).toString('hex'),
        }),
      },
    );
    const session = this.decode(init);
    if (!session.paymentReferenceId || !session.challenge)
      throw new BadRequestException('Incomplete Nagad session');
    const complete = await this.call(
      `check-out/complete/${encodeURIComponent(session.paymentReferenceId)}`,
      {
        ...this.envelope({
          merchantId: process.env.NAGAD_MERCHANT_ID,
          orderId: gatewayOrderId,
          currencyCode: '050',
          amount: (i.amountMinor / 100).toFixed(2),
          challenge: session.challenge,
        }),
        merchantCallbackURL: `${process.env.APP_URL}/api/payments/webhooks/NAGAD`,
      },
    );
    if (complete.status !== 'Success' || !complete.callBackUrl)
      throw new ServiceUnavailableException('Nagad checkout could not be started');
    return {
      providerRef: session.paymentReferenceId as string,
      redirectUrl: complete.callBackUrl as string,
      metadata: { gatewayOrderId },
      status: 'REQUIRES_ACTION' as const,
    };
  }
  callbackReference(body: unknown) {
    const b = body as Record<string, unknown>;
    if (typeof b.payment_ref_id !== 'string' || b.payment_ref_id.length > 160)
      throw new BadRequestException('Invalid Nagad reference');
    return b.payment_ref_id;
  }
  async parseWebhook(
    _raw: Buffer,
    _headers: Record<string, unknown>,
    body: unknown,
    expected?: { orderId: string; amountMinor: number; metadata?: Record<string, string> },
  ) {
    if (!expected) throw new BadRequestException('Unknown Nagad payment');
    const ref = this.callbackReference(body);
    const response = await this.call(`verify/payment/${encodeURIComponent(ref)}`);
    const d = response.sensitiveData ? this.decode(response) : response;
    if (
      d.paymentRefId !== ref ||
      d.orderId !== expected.metadata?.gatewayOrderId ||
      d.merchantId !== process.env.NAGAD_MERCHANT_ID ||
      Math.round(Number(d.amount) * 100) !== expected.amountMinor ||
      (d.currencyCode && d.currencyCode !== '050')
    )
      throw new BadRequestException('Nagad verification mismatch');
    if (!['Success', 'Cancelled', 'Failed', 'Aborted'].includes(d.status))
      throw new ServiceUnavailableException('Nagad payment is pending; do not pay again');
    return {
      eventId: `${ref}:${d.status}`,
      providerRef: ref,
      status: d.status === 'Success' ? ('SUCCEEDED' as const) : ('FAILED' as const),
      amountMinor: expected.amountMinor,
      refundRef: d.issuerPaymentRefNo as string | undefined,
    };
  }
  async refund(ref: string, amountMinor: number, key: string) {
    return { providerRef: `nagad_manual:${ref}:${key}:${amountMinor}`, status: 'PENDING' as const };
  }
}
