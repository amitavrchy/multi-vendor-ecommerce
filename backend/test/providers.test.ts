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
    assert.equal(
      (await adapter.refund('order_contract', 125000, 'refund-key')).status,
      'MANUAL_REVIEW',
    );
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.SSLCOMMERZ_STORE_ID;
    else process.env.SSLCOMMERZ_STORE_ID = oldId;
    if (oldPassword === undefined) delete process.env.SSLCOMMERZ_STORE_PASSWORD;
    else process.env.SSLCOMMERZ_STORE_PASSWORD = oldPassword;
  }
});

test('Stripe polls pending refunds and verifies amount, currency and marketplace metadata', async () => {
  let status = 'pending',
    amount = 125000,
    key = '',
    reference = 're_contract';
  const client = {
    checkout: {
      sessions: {
        retrieve: async (ref: string) => {
          assert.equal(ref, 'cs_contract');
          return { payment_intent: 'pi_contract' };
        },
      },
    },
    refunds: {
      create: async (
        data: {
          amount: number;
          metadata: { marketplaceRefundKey: string };
          payment_intent: string;
        },
        options: { idempotencyKey: string },
      ) => {
        assert.equal(data.payment_intent, 'pi_contract');
        assert.equal(options.idempotencyKey, data.metadata.marketplaceRefundKey);
        key = options.idempotencyKey;
        return {
          id: reference,
          status,
          amount,
          currency: 'bdt',
          metadata: { marketplaceRefundKey: key },
        };
      },
      retrieve: async () => ({
        id: reference,
        status,
        amount,
        currency: 'bdt',
        metadata: { marketplaceRefundKey: key },
      }),
    },
  };
  class ContractStripe extends StripeProvider {
    protected client() {
      return client as unknown as Stripe;
    }
  }
  const adapter = new ContractStripe(),
    context = { paymentRef: 'cs_contract', amountMinor: 125000, idempotencyKey: 'refund-contract' };
  assert.equal(
    (await adapter.refund('cs_contract', 125000, context.idempotencyKey)).status,
    'PROCESSING',
  );
  status = 'succeeded';
  assert.equal((await adapter.checkRefund(reference, context)).status, 'SUCCEEDED');
  amount = 100;
  await assert.rejects(() => adapter.checkRefund(reference, context));
  amount = 125000;
  status = 'failed';
  assert.equal((await adapter.checkRefund(reference, context)).status, 'FAILED');
  status = 'requires_action';
  assert.equal((await adapter.checkRefund(reference, context)).status, 'MANUAL_REVIEW');
  key = 'another-refund';
  await assert.rejects(() => adapter.checkRefund(reference, context));
  key = context.idempotencyKey;
  reference = 're_other';
  await assert.rejects(() => adapter.checkRefund('re_contract', context));
});

test('SSLCommerz initiation is not settlement and refund status binds to the original transaction', async () => {
  const oldId = process.env.SSLCOMMERZ_STORE_ID,
    oldPassword = process.env.SSLCOMMERZ_STORE_PASSWORD,
    oldFetch = globalThis.fetch;
  process.env.SSLCOMMERZ_STORE_ID = 'contract-store';
  process.env.SSLCOMMERZ_STORE_PASSWORD = 'contract-secret';
  let status = 'processing',
    bank = 'bank_contract',
    amount = '1250.00',
    requestId = '';
  const context = {
    paymentRef: 'order_contract',
    transactionRef: 'bank_contract',
    amountMinor: 125000,
    idempotencyKey: 'refund-contract',
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'sandbox.sslcommerz.com');
    assert.equal(url.searchParams.get('store_id'), 'contract-store');
    if (url.searchParams.has('refund_amount')) {
      assert.equal(url.searchParams.get('refund_amount'), '1250.00');
      assert.equal(url.searchParams.get('bank_tran_id'), bank);
      requestId = url.searchParams.get('refund_trans_id')!;
      assert.equal(requestId.length, 30);
      return new Response(
        JSON.stringify({
          APIConnect: 'DONE',
          status: 'success',
          bank_tran_id: bank,
          refund_ref_id: 'ssl_refund',
        }),
      );
    }
    assert.equal(url.searchParams.get('refund_ref_id'), 'ssl_refund');
    return new Response(
      JSON.stringify({
        APIConnect: 'DONE',
        status,
        bank_tran_id: bank,
        tran_id: context.paymentRef,
        refund_ref_id: 'ssl_refund',
        refund_amount: amount,
      }),
    );
  };
  try {
    const adapter = new SslCommerzProvider();
    assert.equal(
      (await adapter.refund(bank, 125000, context.idempotencyKey, context)).status,
      'PROCESSING',
    );
    const firstId = requestId;
    await adapter.refund(bank, 125000, context.idempotencyKey, context);
    assert.equal(requestId, firstId);
    assert.equal((await adapter.checkRefund('ssl_refund', context)).status, 'PROCESSING');
    status = 'refunded';
    assert.equal((await adapter.checkRefund('ssl_refund', context)).status, 'SUCCEEDED');
    bank = 'another-bank';
    await assert.rejects(() => adapter.checkRefund('ssl_refund', context));
    bank = context.transactionRef;
    amount = '10.00';
    await assert.rejects(() => adapter.checkRefund('ssl_refund', context));
    amount = '1250.00';
    status = 'cancelled';
    assert.equal((await adapter.checkRefund('ssl_refund', context)).status, 'FAILED');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.SSLCOMMERZ_STORE_ID;
    else process.env.SSLCOMMERZ_STORE_ID = oldId;
    if (oldPassword === undefined) delete process.env.SSLCOMMERZ_STORE_PASSWORD;
    else process.env.SSLCOMMERZ_STORE_PASSWORD = oldPassword;
  }
});
