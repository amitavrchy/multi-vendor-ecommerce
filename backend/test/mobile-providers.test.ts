import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  sign,
  verify,
} from 'node:crypto';
import { BkashProvider } from '../src/modules/payments/providers/bkash.provider';
import { NagadProvider } from '../src/modules/payments/providers/nagad.provider';
function environment(values: Record<string, string>) {
  const old = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  return () => {
    for (const [k, v] of Object.entries(old))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  };
}
const intent = {
  orderId: 'order-contract-0001',
  amountMinor: 125000,
  currency: 'BDT',
  idempotencyKey: 'contract-idempotency',
  email: 'customer@example.test',
};
test('bKash caches grants and verifies authoritative payment identity/amount rather than callback status', async () => {
  const restore = environment({
      BKASH_APP_KEY: 'app',
      BKASH_APP_SECRET: 'secret',
      BKASH_USERNAME: 'merchant',
      BKASH_PASSWORD: 'password',
      BKASH_BASE_URL: 'https://bkash.test',
      APP_URL: 'https://shop.test',
    }),
    oldFetch = globalThis.fetch;
  let tokens = 0,
    amount = '1250.00',
    completed = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    let d: unknown;
    if (path === '/token/grant') {
      tokens++;
      d = { id_token: 'contract-token', expires_in: 3600 };
    } else if (path === '/create') {
      assert.equal(JSON.parse(String(init?.body)).merchantInvoiceNumber, intent.orderId);
      d = { statusCode: '0000', paymentID: 'payment-1', bkashURL: 'https://bkash.test/pay' };
    } else if (path === '/execute') {
      completed = true;
      d = { statusCode: '0000' };
    } else {
      assert.equal(path, '/payment/status');
      d = {
        paymentID: 'payment-1',
        currency: 'BDT',
        merchantInvoiceNumber: intent.orderId,
        amount,
        transactionStatus: completed ? 'Completed' : 'Initiated',
        trxID: 'trx-1',
      };
    }
    return new Response(JSON.stringify(d));
  };
  try {
    const adapter = new BkashProvider();
    assert.equal(adapter.available, true);
    const session = await adapter.createIntent(intent);
    assert.equal(session.providerRef, 'payment-1');
    const event = await adapter.parseWebhook(
      Buffer.alloc(0),
      {},
      { paymentID: 'payment-1', status: 'failure' },
      intent,
    );
    assert.equal(event.status, 'SUCCEEDED');
    assert.equal(tokens, 1);
    amount = '1.00';
    await assert.rejects(() =>
      adapter.parseWebhook(
        Buffer.alloc(0),
        {},
        { paymentID: 'payment-1', status: 'success' },
        intent,
      ),
    );
    await assert.rejects(() =>
      adapter.parseWebhook(Buffer.alloc(0), {}, { paymentID: 'payment-1' }),
    );
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
test('Nagad signs/encrypts checkout, authenticates gateway handshake and verifies persisted order/amount', async () => {
  const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 }),
    gateway = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const restore = environment({
      NAGAD_MERCHANT_ID: 'merchant-1',
      NAGAD_PRIVATE_KEY: merchant.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      NAGAD_PG_PUBLIC_KEY: gateway.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      NAGAD_BASE_URL: 'https://nagad.test',
      APP_URL: 'https://shop.test',
    }),
    oldFetch = globalThis.fetch;
  let orderId = '',
    amount = '1250.00',
    tamper = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.body) {
      const envelope = JSON.parse(String(init.body));
      const plain = privateDecrypt(
        { key: gateway.privateKey, padding: constants.RSA_PKCS1_PADDING },
        Buffer.from(envelope.sensitiveData, 'base64'),
      );
      assert.ok(
        verify('RSA-SHA256', plain, merchant.publicKey, Buffer.from(envelope.signature, 'base64')),
      );
      const request = JSON.parse(plain.toString());
      if (path.includes('/initialize/')) {
        orderId = request.orderId;
        const body = Buffer.from(
          JSON.stringify({ paymentReferenceId: 'nagad-ref', challenge: 'gateway-challenge' }),
        );
        return new Response(
          JSON.stringify({
            sensitiveData: publicEncrypt(
              { key: merchant.publicKey, padding: constants.RSA_PKCS1_PADDING },
              body,
            ).toString('base64'),
            signature: sign(
              'RSA-SHA256',
              tamper ? Buffer.from('forged') : body,
              gateway.privateKey,
            ).toString('base64'),
          }),
        );
      }
      assert.equal(request.challenge, 'gateway-challenge');
      assert.equal(request.amount, '1250.00');
      return new Response(
        JSON.stringify({ status: 'Success', callBackUrl: 'https://nagad.test/pay' }),
      );
    }
    return new Response(
      JSON.stringify({
        paymentRefId: 'nagad-ref',
        orderId,
        merchantId: 'merchant-1',
        currencyCode: '050',
        amount,
        status: 'Success',
      }),
    );
  };
  try {
    const adapter = new NagadProvider();
    const session = await adapter.createIntent(intent);
    assert.equal(orderId.length, 20);
    const expected = { ...intent, metadata: session.metadata };
    const event = await adapter.parseWebhook(
      Buffer.alloc(0),
      {},
      { payment_ref_id: 'nagad-ref', status: 'Failed' },
      expected,
    );
    assert.equal(event.status, 'SUCCEEDED');
    amount = '9.00';
    await assert.rejects(() =>
      adapter.parseWebhook(Buffer.alloc(0), {}, { payment_ref_id: 'nagad-ref' }, expected),
    );
    tamper = true;
    await assert.rejects(() => adapter.createIntent(intent));
  } finally {
    globalThis.fetch = oldFetch;
    restore();
  }
});
