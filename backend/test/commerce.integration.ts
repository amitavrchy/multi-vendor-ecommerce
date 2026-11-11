import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Db } from '../src/db';
import { ProviderRegistry } from '../src/modules/payments/registry';
import {
  PaymentProvider,
  CreateIntentInput,
  NormalizedEvent,
} from '../src/modules/payments/provider';
import { CheckoutService } from '../src/checkout.service';
import { WebhookController } from '../src/modules/payments/webhook.controller';
import { OrdersService } from '../src/orders.service';
import { VendorScope } from '../src/vendor-scope.service';
import { RefundsService } from '../src/refunds.service';
import { ReturnsController } from '../src/returns.controller';
import { PayoutsController } from '../src/payouts.controller';
import { CatalogController } from '../src/catalog.controller';
import { Principal } from '../src/auth/access';
import { encrypt } from '../src/common/security';
import { config } from '../src/config';
import { DisputesController } from '../src/disputes.controller';
import { DeliveryService } from '../src/delivery.service';
import nodemailer from 'nodemailer';
import { JobsService } from '../src/jobs.service';
const url = new URL(process.env.DATABASE_URL!);
url.pathname = '/bazaar_test';
const db = new Db({ datasourceUrl: url.toString() });
class FakeProvider implements PaymentProvider {
  code = 'FAKE';
  available = true;
  supportsPartialRefund = true;
  calls = 0;
  async createIntent(i: CreateIntentInput) {
    return { providerRef: i.orderId, status: 'REQUIRES_ACTION' as const };
  }
  async parseWebhook(_r: Buffer, _h: unknown, b: unknown) {
    return b as NormalizedEvent;
  }
  async refund(ref: string, _amount: number, key: string) {
    this.calls++;
    return { providerRef: `${ref}:${key}` };
  }
}
const registry = new ProviderRegistry(),
  fake = new FakeProvider();
registry.register(fake);
const checkout = new CheckoutService(db, registry),
  webhook = new WebhookController(db, registry),
  scope = new VendorScope(db),
  orders = new OrdersService(db, scope),
  refunds = new RefundsService(db, registry),
  returns = new ReturnsController(db, refunds),
  payouts = new PayoutsController(db);
before(() => db.$connect());
after(() => db.$disconnect());
async function fixture(stock = 5) {
  const suffix = randomUUID().slice(0, 8);
  const user = await db.user.create({
    data: {
      email: `customer-${suffix}@test.local`,
      name: 'Integration customer',
      passwordHash: 'unused',
    },
  });
  const owner = await db.user.create({
    data: {
      email: `owner-${suffix}@test.local`,
      name: 'Integration seller',
      passwordHash: 'unused',
      role: 'VENDOR_OWNER',
    },
  });
  const category = await db.category.upsert({
    where: { id: 'integration' },
    create: { id: 'integration', name: 'Integration', icon: 'Box' },
    update: {},
  });
  const vendors = await Promise.all(
    [1, 2].map((i) =>
      db.vendor.create({
        data: {
          slug: `test-${suffix}-${i}`,
          storeName: `Store ${i}`,
          ownerId: owner.id,
          status: 'ACTIVE',
          bankEncrypted: encrypt('Integration bank account 123456', config.BANK_ENCRYPTION_KEY),
          balance: { create: {} },
          products: {
            create: {
              slug: `test-product-${suffix}-${i}`,
              title: `Find ${suffix} ${i}`,
              description: 'A thoughtful integration test product',
              image: '/products/01.jpg',
              categoryId: category.id,
              status: 'ACTIVE',
              variants: {
                create: {
                  sku: `test-${suffix}-${i}`,
                  priceMinor: 10000 * i,
                  stockQty: stock,
                  attrs: {},
                },
              },
            },
          },
        },
        include: { products: { include: { variants: true } } },
      }),
    ),
  );
  const address = await db.address.create({
    data: {
      userId: user.id,
      label: 'Home',
      name: 'Test Customer',
      phone: '+8801700000000',
      line1: 'Test Street 12',
      city: 'Dhaka',
      postalCode: '1209',
    },
  });
  const cart = await db.cart.create({
    data: {
      userId: user.id,
      items: { create: vendors.map((v) => ({ variantId: v.products[0].variants[0].id, qty: 1 })) },
    },
  });
  return { user: user as Principal, owner: owner as Principal, vendors, address, cart };
}
async function pay(
  orderId: string,
  eventId = randomUUID(),
  status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED',
) {
  const p = await db.payment.findUniqueOrThrow({ where: { orderId } });
  return webhook.receive('FAKE', {}, {
    body: { eventId, providerRef: orderId, status, amountMinor: p.amountMinor },
    rawBody: Buffer.alloc(0),
  } as never);
}
test('two-vendor checkout snapshots and reserves atomically; replay settles once', async () => {
  const f = await fixture();
  const key = randomUUID();
  const r = await checkout.start(f.user, { addressId: f.address.id, provider: 'FAKE' }, key);
  const order = await db.order.findUniqueOrThrow({
    where: { id: r.orderId },
    include: { vendorOrders: { include: { lines: true } }, reservations: true },
  });
  assert.equal(order.vendorOrders.length, 2);
  assert.equal(order.grandMinor, 46000);
  assert.equal(order.reservations.length, 2);
  assert.equal(order.vendorOrders[0].lines[0].commissionBps, 1000);
  for (const v of f.vendors) {
    const item = await db.productVariant.findUniqueOrThrow({
      where: { id: v.products[0].variants[0].id },
    });
    assert.equal(item.stockQty, 5);
    assert.equal(item.reservedQty, 1);
  }
  assert.equal(
    (await checkout.start(f.user, { addressId: f.address.id, provider: 'FAKE' }, key)).orderId,
    r.orderId,
  );
  const event = randomUUID();
  await pay(r.orderId, event);
  const duplicate = await pay(r.orderId, event);
  assert.equal((duplicate as { duplicate?: boolean }).duplicate, true);
  for (const v of f.vendors) {
    const item = await db.productVariant.findUniqueOrThrow({
      where: { id: v.products[0].variants[0].id },
    });
    assert.equal(item.stockQty, 4);
    assert.equal(item.reservedQty, 0);
  }
  assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 0);
  assert.equal(
    await db.vendorLedgerEntry.count({ where: { vendorId: { in: f.vendors.map((v) => v.id) } } }),
    0,
  );
});
test('one unavailable vendor rolls back all reservations and the master order', async () => {
  const f = await fixture();
  await db.productVariant.update({
    where: { id: f.vendors[1].products[0].variants[0].id },
    data: { stockQty: 0 },
  });
  await assert.rejects(() =>
    checkout.start(f.user, { addressId: f.address.id, provider: 'FAKE' }, randomUUID()),
  );
  assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
  const first = await db.productVariant.findUniqueOrThrow({
    where: { id: f.vendors[0].products[0].variants[0].id },
  });
  assert.equal(first.reservedQty, 0);
});
test('failed payment releases stock without consuming or clearing the bag', async () => {
  const f = await fixture();
  const r = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE' },
    randomUUID(),
  );
  await pay(r.orderId, randomUUID(), 'FAILED');
  const v = await db.productVariant.findUniqueOrThrow({
    where: { id: f.vendors[0].products[0].variants[0].id },
  });
  assert.equal(v.stockQty, 5);
  assert.equal(v.reservedQty, 0);
  assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 2);
});
test('concurrent last-item checkouts cannot oversell', async () => {
  const f = await fixture(1);
  const results = await Promise.allSettled([
    checkout.start(f.user, { addressId: f.address.id, provider: 'FAKE' }, randomUUID()),
    checkout.start(f.user, { addressId: f.address.id, provider: 'FAKE' }, randomUUID()),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const v of f.vendors) {
    const variant = await db.productVariant.findUniqueOrThrow({
      where: { id: v.products[0].variants[0].id },
    });
    assert.equal(variant.reservedQty, 1);
    assert.equal(variant.stockQty, 1);
  }
});
test('COD earns nothing before delivery; replayed delivery credits only once', async () => {
  const f = await fixture();
  const r = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'COD' },
    randomUUID(),
  );
  const vo = await db.vendorOrder.findFirstOrThrow({ where: { orderId: r.orderId } });
  assert.equal(
    (await db.vendorBalance.findUniqueOrThrow({ where: { vendorId: vo.vendorId } })).availableMinor,
    0,
  );
  const admin = { ...f.user, role: 'PLATFORM_ADMIN' };
  await orders.transition(admin, vo.id, 'PROCESSING');
  await orders.transition(admin, vo.id, 'SHIPPED', 'TRACK-1');
  await orders.transition(admin, vo.id, 'DELIVERED');
  await orders.transition(admin, vo.id, 'DELIVERED');
  assert.equal(
    (await db.vendorBalance.findUniqueOrThrow({ where: { vendorId: vo.vendorId } })).availableMinor,
    vo.vendorNetMinor,
  );
  assert.equal(await db.vendorLedgerEntry.count({ where: { refId: `delivery:${vo.id}` } }), 1);
});
test('delivered return claws back an already-paid vendor into a negative balance', async () => {
  const f = await fixture();
  const r = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE' },
    randomUUID(),
  );
  await pay(r.orderId);
  const vos = await db.vendorOrder.findMany({ where: { orderId: r.orderId } });
  const admin = { ...f.user, role: 'PLATFORM_ADMIN' };
  for (const vo of vos) {
    await orders.transition(admin, vo.id, 'PROCESSING');
    await orders.transition(admin, vo.id, 'SHIPPED', 'TRACK-2');
    await orders.transition(admin, vo.id, 'DELIVERED');
  }
  const batch = await payouts.run();
  const instructions = await payouts.instructions(batch.id);
  assert.ok(
    instructions.some((account) => account.bankDetails === 'Integration bank account 123456'),
  );
  await payouts.confirm(batch.id, { transferReference: 'TEST-TRANSFER-1' });
  await payouts.confirm(batch.id, { transferReference: 'TEST-TRANSFER-1' });
  const vo = vos[0];
  const returned = await returns.request(f.user, {
    vendorOrderId: vo.id,
    reason: 'The item arrived damaged and needs a return',
  });
  await returns.review(returned.id, { status: 'APPROVED' });
  await returns.review(returned.id, { status: 'ITEM_RECEIVED' });
  const refund = await db.refund.findUniqueOrThrow({
    where: { idempotencyKey: `return:${returned.id}` },
  });
  await refunds.process(refund.id);
  await refunds.process(refund.id);
  assert.equal(
    (await db.vendorBalance.findUniqueOrThrow({ where: { vendorId: vo.vendorId } })).availableMinor,
    -vo.vendorNetMinor,
  );
  assert.equal(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: returned.id } })).status,
    'REFUNDED',
  );
  assert.equal(await db.vendorLedgerEntry.count({ where: { refId: `refund:${refund.id}` } }), 1);
});
test('suspended vendor listings stay out of product search and detail', async () => {
  const f = await fixture();
  await db.vendor.update({ where: { id: f.vendors[0].id }, data: { status: 'SUSPENDED' } });
  const catalog = new CatalogController(db);
  const result = await catalog.products({ vendor: f.vendors[0].slug });
  assert.equal(result.total, 0);
  await assert.rejects(() => catalog.detail(f.vendors[0].products[0].slug));
});
test('one new provider class and registry entry are sufficient for checkout', async () => {
  const f = await fixture();
  assert.equal(registry.get('FAKE'), fake);
  const r = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE' },
    randomUUID(),
  );
  assert.equal(r.status, 'REQUIRES_ACTION');
});

test('partial returns respect quantities and retain the configured restocking fee', async () => {
  const previous = await db.platformPolicy.findUnique({ where: { id: 'marketplace' } });
  await db.platformPolicy.upsert({
    where: { id: 'marketplace' },
    create: { restockingBps: 1000 },
    update: { restockingBps: 1000 },
  });
  try {
    const f = await fixture();
    const variant = f.vendors[0].products[0].variants[0];
    await db.cartItem.updateMany({
      where: { cartId: f.cart.id, variantId: variant.id },
      data: { qty: 2 },
    });
    const r = await checkout.start(
      f.user,
      { addressId: f.address.id, provider: 'FAKE' },
      randomUUID(),
    );
    await pay(r.orderId);
    const vo = await db.vendorOrder.findFirstOrThrow({
        where: { orderId: r.orderId, vendorId: f.vendors[0].id },
        include: { lines: true },
      }),
      admin = { ...f.user, role: 'PLATFORM_ADMIN' };
    await orders.transition(admin, vo.id, 'PROCESSING');
    await orders.transition(admin, vo.id, 'SHIPPED', 'PARTIAL-TRACK');
    await orders.transition(admin, vo.id, 'DELIVERED');
    for (let i = 0; i < 2; i++) {
      const rma = await returns.request(f.user, {
        vendorOrderId: vo.id,
        reason: 'One item needs to be returned for inspection',
        lines: [{ lineId: vo.lines[0].id, qty: 1 }],
      });
      assert.equal(rma.restockingFeeMinor, 1000);
      await returns.review(rma.id, { status: 'APPROVED' });
      await returns.review(rma.id, { status: 'ITEM_RECEIVED' });
      const refund = await db.refund.findUniqueOrThrow({ where: { returnRequestId: rma.id } });
      assert.equal(refund.amountMinor, 9000);
      await refunds.process(refund.id);
    }
    await assert.rejects(() =>
      returns.request(f.user, {
        vendorOrderId: vo.id,
        reason: 'Attempting to return a third item',
        lines: [{ lineId: vo.lines[0].id, qty: 1 }],
      }),
    );
    assert.equal(
      (await db.vendorBalance.findUniqueOrThrow({ where: { vendorId: vo.vendorId } }))
        .availableMinor,
      2000,
    );
    const batch = await payouts.run();
    const item = await db.payoutItem.findUniqueOrThrow({ where: { vendorOrderId: vo.id } });
    assert.equal(item.amountMinor, 2000);
    assert.equal(item.batchId, batch.id);
    await payouts.confirm(batch.id, { transferReference: 'PARTIAL-RESTOCK-PAYOUT' });
  } finally {
    if (previous)
      await db.platformPolicy.update({
        where: { id: 'marketplace' },
        data: { restockingBps: previous.restockingBps },
      });
    else await db.platformPolicy.delete({ where: { id: 'marketplace' } });
  }
});
test('a late successful payment queues a refund without reviving a cancelled order', async () => {
  const f = await fixture(),
    r = await checkout.start(f.user, { addressId: f.address.id, provider: 'FAKE' }, randomUUID());
  await checkout.cancelPending(r.orderId);
  await pay(r.orderId);
  const payment = await db.payment.findUniqueOrThrow({ where: { orderId: r.orderId } });
  const refund = await db.refund.findUniqueOrThrow({
    where: { idempotencyKey: `late:${payment.id}` },
  });
  await refunds.process(refund.id);
  assert.equal(
    (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status,
    'CANCELLED',
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedMinor,
    payment.amountMinor,
  );
});
test('dispute threads are scoped to the buyer, assigned store and support staff', async () => {
  const f = await fixture(),
    other = await fixture(),
    r = await checkout.start(f.user, { addressId: f.address.id, provider: 'COD' }, randomUUID());
  const vo = await db.vendorOrder.findFirstOrThrow({ where: { orderId: r.orderId } });
  const cases = new DisputesController(db);
  const dispute = await cases.open(f.user, {
    vendorOrderId: vo.id,
    subject: 'Delivery question',
    body: 'Could you confirm when this shipment will leave the store?',
  });
  assert.equal(
    (await cases.list(other.user)).some((c) => c.id === dispute.id),
    false,
  );
  await assert.rejects(() => cases.reply(other.user, dispute.id, { body: 'Unauthorized message' }));
  await cases.reply(f.owner, dispute.id, { body: 'We will prepare it today.' });
  await cases.resolve(dispute.id, {
    status: 'RESOLVED',
    resolution: 'Delivery date confirmed with buyer',
  });
  await assert.rejects(() => cases.reply(f.user, dispute.id, { body: 'Closed case' }));
});
test('email delivery receipts deduplicate retries and preserve failed attempts', async () => {
  const oldUrl = process.env.SMTP_URL,
    oldCreate = nodemailer.createTransport,
    oldSms = process.env.SMS_URL;
  process.env.SMTP_URL = 'smtp://contract.test';
  delete process.env.SMS_URL;
  let sent = 0,
    fail = true;
  nodemailer.createTransport = (() => ({
    sendMail: async () => {
      sent++;
      if (fail) throw new Error('Temporary SMTP failure');
      return { messageId: 'mail-contract' };
    },
  })) as typeof nodemailer.createTransport;
  try {
    const event = await db.outboxEvent.create({ data: { type: 'EMAIL_CONTRACT', payload: {} } }),
      delivery = new DeliveryService(db);
    const message = { email: 'nobody@example.test', subject: 'Test', text: 'Contract test only' };
    await assert.rejects(() => delivery.deliver(event.id, message));
    fail = false;
    await delivery.deliver(event.id, message);
    await delivery.deliver(event.id, message);
    assert.equal(sent, 2);
    const receipt = await db.deliveryReceipt.findUniqueOrThrow({
      where: { eventId_channel: { eventId: event.id, channel: 'EMAIL' } },
    });
    assert.equal(receipt.status, 'SENT');
    assert.equal(receipt.attempts, 2);
  } finally {
    nodemailer.createTransport = oldCreate;
    if (oldUrl === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = oldUrl;
    if (oldSms !== undefined) process.env.SMS_URL = oldSms;
  }
});
test('vendor-funded coupons and category commission overrides snapshot the correct earnings', async () => {
  const f = await fixture(),
    code = `VENDOR_${randomUUID().slice(0, 8)}`.toUpperCase();
  const product = f.vendors[0].products[0];
  const categoryId = `commission-${randomUUID()}`;
  await db.category.create({
    data: { id: categoryId, name: 'Commission fixture', icon: 'Box', commissionBps: 500 },
  });
  await db.product.update({ where: { id: product.id }, data: { categoryId } });
  await db.coupon.create({
    data: {
      code,
      percent: 10,
      maxDiscountMinor: 100000,
      minGoodsMinor: 0,
      funding: 'VENDOR',
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const r = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', couponCode: code },
    randomUUID(),
  );
  const vo = await db.vendorOrder.findFirstOrThrow({
    where: { orderId: r.orderId, vendorId: f.vendors[0].id },
    include: { lines: true },
  });
  assert.equal(vo.commissionMinor, 500);
  assert.equal(vo.vendorFundedDiscountMinor, 1000);
  assert.equal(vo.vendorNetMinor, 8500);
  assert.equal(vo.lines[0].commissionBps, 500);
});
test('maintenance expires reservations, queues delayed review requests and prepares a weekly batch once', async () => {
  const previous = await db.platformPolicy.findUnique({ where: { id: 'marketplace' } }),
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
    weekday = new Date(`${today}T12:00:00+06:00`).getUTCDay();
  await db.platformPolicy.upsert({
    where: { id: 'marketplace' },
    create: { weeklyPayouts: true, payoutWeekday: weekday, reviewDelayDays: 1 },
    update: { weeklyPayouts: true, payoutWeekday: weekday, reviewDelayDays: 1 },
  });
  try {
    const pending = await fixture(),
      r = await checkout.start(
        pending.user,
        { addressId: pending.address.id, provider: 'FAKE' },
        randomUUID(),
      );
    await db.stockReservation.updateMany({
      where: { orderId: r.orderId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const f = await fixture(),
      delivered = await checkout.start(
        f.user,
        { addressId: f.address.id, provider: 'COD' },
        randomUUID(),
      ),
      vo = await db.vendorOrder.findFirstOrThrow({ where: { orderId: delivered.orderId } }),
      admin = { ...f.user, role: 'PLATFORM_ADMIN' };
    await orders.transition(admin, vo.id, 'PROCESSING');
    await orders.transition(admin, vo.id, 'SHIPPED', 'REVIEW-TRACK');
    await orders.transition(admin, vo.id, 'DELIVERED');
    await db.vendorOrder.update({
      where: { id: vo.id },
      data: { deliveredAt: new Date(Date.now() - 3 * 86400000) },
    });
    const jobs = new JobsService(
      db,
      checkout,
      refunds,
      { notify: () => {} } as never,
      { deliver: async () => {} } as never,
      { invalidate: async () => {}, purge: async () => {} } as never,
      registry,
    );
    await jobs.tick();
    await jobs.tick();
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status,
      'CANCELLED',
    );
    assert.equal(await db.outboxEvent.count({ where: { id: `review:${vo.id}` } }), 1);
    assert.equal(await db.payoutBatch.count({ where: { scheduleKey: `weekly:${today}` } }), 1);
  } finally {
    if (previous) await db.platformPolicy.update({ where: { id: 'marketplace' }, data: previous });
    else await db.platformPolicy.delete({ where: { id: 'marketplace' } });
  }
});
