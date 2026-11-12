import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CreateIntentInput, PaymentProvider } from '../provider';
import { createHash } from 'node:crypto';
import { RefundContext, RefundResult } from '../refund';
export class SslCommerzProvider implements PaymentProvider {
  code = 'SSLCOMMERZ';
  supportsPartialRefund = true;
  available = !!(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD);
  private base =
    process.env.SSLCOMMERZ_IS_LIVE === 'true'
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com';
  private credentials() {
    if (!this.available) throw new ServiceUnavailableException('SSLCommerz is not configured');
    return {
      store_id: process.env.SSLCOMMERZ_STORE_ID!,
      store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD!,
    };
  }
  async createIntent(i: CreateIntentInput) {
    const url = process.env.APP_URL!;
    const form = new URLSearchParams({
      ...this.credentials(),
      total_amount: (i.amountMinor / 100).toFixed(2),
      currency: i.currency,
      tran_id: i.orderId,
      success_url: `${url}/api/payments/return`,
      fail_url: `${url}/api/payments/return`,
      cancel_url: `${url}/api/payments/return`,
      ipn_url: `${url}/api/payments/webhooks/SSLCOMMERZ`,
      cus_name: 'Bazaar customer',
      cus_email: i.email,
      cus_add1: 'Bangladesh',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: '01700000000',
      shipping_method: 'NO',
      product_name: 'Marketplace order',
      product_category: 'General',
      product_profile: 'general',
    });
    const r = await fetch(`${this.base}/gwprocess/v4/api.php`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (!r.ok || d.status !== 'SUCCESS' || !d.GatewayPageURL)
      throw new ServiceUnavailableException('Payment gateway did not start this session');
    return {
      providerRef: i.orderId,
      redirectUrl: d.GatewayPageURL as string,
      status: 'REQUIRES_ACTION' as const,
    };
  }
  async parseWebhook(_raw: Buffer, _headers: Record<string, unknown>, body: unknown) {
    const b = body as Record<string, string>;
    if (!b.val_id) throw new BadRequestException('Missing validation reference');
    const query = new URLSearchParams({ ...this.credentials(), val_id: b.val_id, format: 'json' });
    const r = await fetch(`${this.base}/validator/api/validationserverAPI.php?${query}`, {
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (
      !r.ok ||
      !['VALID', 'VALIDATED'].includes(d.status) ||
      d.tran_id !== b.tran_id ||
      d.currency !== 'BDT' ||
      (d.store_id && d.store_id !== process.env.SSLCOMMERZ_STORE_ID)
    )
      throw new BadRequestException('Gateway validation failed');
    return {
      eventId: d.val_id as string,
      providerRef: d.tran_id as string,
      status: 'SUCCEEDED' as const,
      amountMinor: Math.round(Number(d.amount) * 100),
      refundRef: typeof d.bank_tran_id === 'string' ? d.bank_tran_id : undefined,
    };
  }
  private async refundRequest(parameters: Record<string, string>) {
    const query = new URLSearchParams({ ...this.credentials(), ...parameters, format: 'json' });
    const response = await fetch(
      `${this.base}/validator/api/merchantTransIDvalidationAPI.php?${query}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const data = await response.json();
    if (!response.ok || data.APIConnect !== 'DONE')
      throw new ServiceUnavailableException('SSLCommerz refund verification is unavailable');
    return data;
  }
  async refund(
    ref: string,
    amountMinor: number,
    key: string,
    context?: RefundContext,
  ): Promise<RefundResult> {
    this.credentials();
    if (!context?.transactionRef)
      return { providerRef: `ssl_manual:${ref}:${key}`, status: 'MANUAL_REVIEW' };
    const refundId = createHash('sha256').update(key).digest('hex').slice(0, 30);
    const data = await this.refundRequest({
      bank_tran_id: context.transactionRef,
      refund_trans_id: refundId,
      refund_amount: (amountMinor / 100).toFixed(2),
      refund_remarks: 'Marketplace return or cancellation',
      refe_id: refundId,
    });
    if (data.bank_tran_id !== context.transactionRef)
      throw new BadRequestException('SSLCommerz refund transaction mismatch');
    if (data.status === 'failed')
      return { providerRef: data.refund_ref_id || refundId, status: 'FAILED' };
    if (!['success', 'processing'].includes(data.status) || typeof data.refund_ref_id !== 'string')
      throw new ServiceUnavailableException('SSLCommerz refund outcome requires reconciliation');
    return { providerRef: data.refund_ref_id, status: 'PROCESSING' };
  }
  async checkRefund(ref: string, context: RefundContext): Promise<RefundResult> {
    const data = await this.refundRequest({ refund_ref_id: ref });
    if (
      data.refund_ref_id !== ref ||
      !context.transactionRef ||
      data.bank_tran_id !== context.transactionRef ||
      ((data.tran_id || data.trans_id) && (data.tran_id || data.trans_id) !== context.paymentRef)
    )
      throw new BadRequestException('SSLCommerz refund verification mismatch');
    if (
      data.refund_amount !== undefined &&
      Math.round(Number(data.refund_amount) * 100) !== context.amountMinor
    )
      throw new BadRequestException('SSLCommerz refund amount mismatch');
    if (!['refunded', 'processing', 'cancelled', 'failed'].includes(data.status))
      throw new ServiceUnavailableException('Unknown SSLCommerz refund status');
    return {
      providerRef: ref,
      status:
        data.status === 'refunded'
          ? 'SUCCEEDED'
          : data.status === 'processing'
            ? 'PROCESSING'
            : 'FAILED',
    };
  }
}
