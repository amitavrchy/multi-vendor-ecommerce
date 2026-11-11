import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { StripeProvider } from '../src/modules/payments/providers/stripe.provider';
import { SslCommerzProvider } from '../src/modules/payments/providers/sslcommerz.provider';

test('Stripe accepts signed paid sessions and rejects forged or unsettled events', async () => {
  const oldKey = process.env.STRIPE_SECRET_KEY,
    oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_contract_only';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_contract_only';
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY),
      adapter = new StripeProvider();
    const signed = (payment_status: string) => {
      const payload = JSON.stringify({
        id: 'evt_contract',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_contract', payment_status, amount_total: 125000 } },
      });
      return {
        raw: Buffer.from(payload),
        signature: stripe.webhooks.generateTestHeaderString({
          payload,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        }),
      };
    };
    const paid = signed('paid');
    const event = await adapter.parseWebhook(paid.raw, { 'stripe-signature': paid.signature });
    assert.deepEqual(event, {
      eventId: 'evt_contract',
      providerRef: 'cs_contract',
      status: 'SUCCEEDED',
      amountMinor: 125000,
    });
    await assert.rejects(() => adapter.parseWebhook(paid.raw, { 'stripe-signature': 'forged' }));
    const unpaid = signed('unpaid');
    await assert.rejects(() =>
      adapter.parseWebhook(unpaid.raw, { 'stripe-signature': unpaid.signature }),
    );
  } finally {
    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
  }
});

test('SSLCommerz validates server responses, checks currency/reference, and queues manual refunds', async () => {
  const oldId = process.env.SSLCOMMERZ_STORE_ID,
    oldPassword = process.env.SSLCOMMERZ_STORE_PASSWORD,
    oldFetch = globalThis.fetch;
  process.env.SSLCOMMERZ_STORE_ID = 'contract-store';
  process.env.SSLCOMMERZ_STORE_PASSWORD = 'contract-secret';
  try {
    let currency = 'BDT';
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('store_id'), 'contract-store');
      return new Response(
        JSON.stringify({
          status: 'VALIDATED',
          tran_id: 'order_contract',
          val_id: 'val_contract',
          amount: '1250.00',
          currency,
        }),
      );
    };
    const adapter = new SslCommerzProvider();
    const event = await adapter.parseWebhook(
      Buffer.alloc(0),
      {},
      { tran_id: 'order_contract', val_id: 'val_contract' },
    );
    assert.equal(event.amountMinor, 125000);
    assert.equal(event.status, 'SUCCEEDED');
    await assert.rejects(() =>
      adapter.parseWebhook(Buffer.alloc(0), {}, { tran_id: 'other-order', val_id: 'val_contract' }),
    );
    currency = 'USD';
    await assert.rejects(() =>
      adapter.parseWebhook(
        Buffer.alloc(0),
        {},
        { tran_id: 'order_contract', val_id: 'val_contract' },
      ),
    );
    assert.equal((await adapter.refund('order_contract', 125000, 'refund-key')).status, 'PENDING');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.SSLCOMMERZ_STORE_ID;
    else process.env.SSLCOMMERZ_STORE_ID = oldId;
    if (oldPassword === undefined) delete process.env.SSLCOMMERZ_STORE_PASSWORD;
    else process.env.SSLCOMMERZ_STORE_PASSWORD = oldPassword;
  }
});
