import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { CreateIntentInput, PaymentProvider } from '../provider';
export class StripeProvider implements PaymentProvider {
  code = 'STRIPE';
  supportsPartialRefund = true;
  available = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  private client() {
    if (!this.available) throw new ServiceUnavailableException('Stripe is not configured');
    return new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  async createIntent(i: CreateIntentInput) {
    const s = await this.client().checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: i.email,
        line_items: [
          {
            price_data: {
              currency: i.currency.toLowerCase(),
              unit_amount: i.amountMinor,
              product_data: { name: `Bazaar order ${i.orderId}` },
            },
            quantity: 1,
          },
        ],
        metadata: { orderId: i.orderId },
        success_url: `${process.env.APP_URL}/orders?payment=received`,
        cancel_url: `${process.env.APP_URL}/orders?payment=cancelled`,
      },
      { idempotencyKey: i.idempotencyKey },
    );
    return { providerRef: s.id, redirectUrl: s.url!, status: 'REQUIRES_ACTION' as const };
  }
  async parseWebhook(raw: Buffer, headers: Record<string, unknown>) {
    let e: Stripe.Event;
    try {
      e = this.client().webhooks.constructEvent(
        raw,
        String(headers['stripe-signature'] || ''),
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
    if (
      ![
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.expired',
        'checkout.session.async_payment_failed',
      ].includes(e.type)
    )
      throw new BadRequestException('Unsupported payment event');
    const s = e.data.object as Stripe.Checkout.Session;
    if (e.type === 'checkout.session.completed' && s.payment_status !== 'paid')
      throw new BadRequestException('Payment is not settled');
    return {
      eventId: e.id,
      providerRef: s.id,
      status: (s.payment_status === 'paid' ? 'SUCCEEDED' : 'FAILED') as 'SUCCEEDED' | 'FAILED',
      amountMinor: s.amount_total!,
    };
  }
  async refund(ref: string, amountMinor: number, key: string) {
    const client = this.client();
    const session = await client.checkout.sessions.retrieve(ref);
    const r = await client.refunds.create(
      { payment_intent: session.payment_intent as string, amount: amountMinor },
      { idempotencyKey: key },
    );
    if (r.status === 'failed' || r.status === 'canceled')
      throw new ServiceUnavailableException('Stripe refund did not succeed');
    return {
      providerRef: r.id,
      status: r.status === 'succeeded' ? ('SUCCEEDED' as const) : ('PENDING' as const),
    };
  }
}
