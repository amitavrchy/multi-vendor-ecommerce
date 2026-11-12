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
import { testDatabaseUrl } from './database';
import { bootstrapAdmin } from '../src/auth/bootstrap';
import { compare } from 'bcryptjs';
import { DiscoveryController } from '../src/discovery.controller';
import { ShoppingAlertsService } from '../src/shopping-alerts.service';
import { AnalyticsController } from '../src/analytics.controller';
import { VendorCatalogController } from '../src/vendor-catalog.controller';
import { BusinessController } from '../src/business.controller';
import { SubscriptionsController, prepareRenewals } from '../src/subscriptions.controller';
import { RewardsController } from '../src/rewards.controller';
import { MarketingController, prepareCampaigns } from '../src/marketing.controller';
import { decrypt } from '../src/common/security';
import { RefundContext, RefundResult, RefundState } from '../src/modules/payments/refund';
const url = testDatabaseUrl();
test('production admin bootstrap creates a hashed admin and refuses account takeover', async () => {
  const email = `bootstrap-${randomUUID()}@bazaar.test`;
  const admin = await bootstrapAdmin(db, {
    name: 'Launch Admin',
    email,
    password: 'LaunchAdmin2026!',
  });
  assert.equal(admin.role, 'PLATFORM_ADMIN');
  const stored = await db.user.findUniqueOrThrow({ where: { email } });
  assert.ok(await compare('LaunchAdmin2026!', stored.passwordHash));
  await db.user.update({ where: { email }, data: { role: 'CUSTOMER' } });
  await assert.rejects(
    bootstrapAdmin(db, { name: 'Replacement', email, password: 'ChangedAdmin2026!' }),
    /already exists/,
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { email } })).role, 'CUSTOMER');
  await assert.rejects(
    bootstrapAdmin(db, { name: 'Launch Admin', email: `long-${email}`, password: '界'.repeat(25) }),
  );
});
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

class AsyncRefundProvider extends FakeProvider {
  code = `ASYNC_${randomUUID()}`;
  refundRetrySafe = true;
  starts = 0;
  checks = 0;
  startFailure?: Error;
  checkHook?: (ref: string, context: RefundContext) => Promise<RefundResult>;
  state: RefundState = 'PROCESSING';
  async refund(_ref: string, _amount: number, key: string) {
    this.starts++;
    if (this.startFailure) throw this.startFailure;
    return { providerRef: `refund_${key}`, status: this.state };
  }
  async checkRefund(ref: string, context: RefundContext): Promise<RefundResult> {
    this.checks++;
    if (this.checkHook) return this.checkHook(ref, context);
    return { providerRef: ref, status: this.state };
  }
}
async function refundFixture(adapter: AsyncRefundProvider) {
  registry.register(adapter);
  const f = await fixture();
  const r = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: adapter.code },
    randomUUID(),
  );
  const payment = await db.payment.findUniqueOrThrow({ where: { orderId: r.orderId } });
  await webhook.receive(adapter.code, {}, {
    body: {
      eventId: randomUUID(),
      providerRef: r.orderId,
      status: 'SUCCEEDED',
      amountMinor: payment.amountMinor,
    },
    rawBody: Buffer.alloc(0),
  } as never);
  const vo = await db.vendorOrder.findFirstOrThrow({
      where: { orderId: r.orderId },
      include: { lines: true },
    }),
    admin = { ...f.user, role: 'PLATFORM_ADMIN' };
  await orders.transition(admin, vo.id, 'PROCESSING');
  await orders.transition(admin, vo.id, 'SHIPPED', 'REFUND-CONTRACT');
  await orders.transition(admin, vo.id, 'DELIVERED');
  const rma = await returns.request(f.user, {
    vendorOrderId: vo.id,
    reason: 'The delivered item needs to be returned for a refund',
  });
  await returns.review(rma.id, { status: 'APPROVED' });
  await returns.review(rma.id, { status: 'ITEM_RECEIVED' });
  const refund = await db.refund.findUniqueOrThrow({ where: { returnRequestId: rma.id } });
  return { f, vo, rma, refund, payment };
}
test('asynchronous refunds leave balances and stock untouched until verified settlement', async () => {
  const adapter = new AsyncRefundProvider(),
    f = await refundFixture(adapter);
  await refunds.process(f.refund.id);
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'PROCESSING',
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).refundedMinor,
    0,
  );
  assert.equal(
    (await db.vendorBalance.findUniqueOrThrow({ where: { vendorId: f.vo.vendorId } }))
      .availableMinor,
    f.vo.vendorNetMinor,
  );
  await refunds.process(f.refund.id);
  assert.equal(adapter.checks, 0);
  adapter.state = 'SUCCEEDED';
  await refunds.process(f.refund.id, true);
  await refunds.process(f.refund.id, true);
  assert.equal(adapter.starts, 1);
  assert.equal(adapter.checks, 1);
  assert.equal(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: f.rma.id } })).status,
    'REFUNDED',
  );
  assert.equal(
    (await db.productVariant.findUniqueOrThrow({ where: { id: f.vo.lines[0].variantId } }))
      .stockQty,
    5,
  );
  assert.equal(await db.vendorLedgerEntry.count({ where: { refId: `refund:${f.refund.id}` } }), 1);
});
test('two workers cannot initiate the same refund while its lease is active', async () => {
  const adapter = new AsyncRefundProvider(),
    f = await refundFixture(adapter);
  await Promise.all([refunds.process(f.refund.id), refunds.process(f.refund.id)]);
  assert.equal(adapter.starts, 1);
  const row = await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } });
  assert.equal(row.status, 'PROCESSING');
  assert.equal(row.leaseToken, null);
  assert.equal(row.leaseUntil, null);
});
test('a stale failed poll cannot overwrite a newer worker settlement', async () => {
  const adapter = new AsyncRefundProvider(),
    f = await refundFixture(adapter);
  await refunds.process(f.refund.id);
  let started!: () => void, rejectOld!: (reason: Error) => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const oldPoll = new Promise<RefundResult>((_resolve, reject) => {
    rejectOld = reject;
  });
  adapter.checkHook = async (ref) => {
    if (adapter.checks === 1) {
      started();
      return oldPoll;
    }
    return { providerRef: ref, status: 'SUCCEEDED' };
  };
  const first = refunds.process(f.refund.id, true);
  await ready;
  await db.refund.update({
    where: { id: f.refund.id },
    data: { leaseUntil: new Date(Date.now() - 1000) },
  });
  await refunds.process(f.refund.id, true);
  rejectOld(new Error('Late transport failure from the old worker'));
  await first;
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'SUCCEEDED',
  );
  assert.equal(await db.vendorLedgerEntry.count({ where: { refId: `refund:${f.refund.id}` } }), 1);
});
test('uncertain non-idempotent submissions are never automatically initiated again', async () => {
  const adapter = new AsyncRefundProvider();
  adapter.refundRetrySafe = false;
  adapter.startFailure = new Error('Gateway timed out after submission');
  const f = await refundFixture(adapter);
  await refunds.process(f.refund.id);
  await refunds.process(f.refund.id, true);
  assert.equal(adapter.starts, 1);
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'MANUAL_REVIEW',
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).refundedMinor,
    0,
  );
  await returns.confirm(f.refund.id, { transferReference: 'EXTERNALLY-VERIFIED-TRANSFER' });
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'SUCCEEDED',
  );
});
test('failed gateway refunds require an explicit manual review before external-transfer confirmation', async () => {
  const adapter = new AsyncRefundProvider();
  adapter.state = 'FAILED';
  const f = await refundFixture(adapter);
  await refunds.process(f.refund.id);
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'FAILED',
  );
  await assert.rejects(() =>
    returns.confirm(f.refund.id, { transferReference: 'NOT-YET-REVIEWED' }),
  );
  await returns.manual(f.refund.id, {
    reason: 'The gateway failed; customer bank transfer was arranged by the operator.',
  });
  await returns.confirm(f.refund.id, { transferReference: 'MANUAL-TRANSFER-VERIFIED' });
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'SUCCEEDED',
  );
});
test('expired idempotency windows do not reinitiate uncertain refunds', async () => {
  const adapter = new AsyncRefundProvider(),
    f = await refundFixture(adapter);
  await db.refund.update({
    where: { id: f.refund.id },
    data: { attempts: 1, createdAt: new Date(Date.now() - 48 * 3600000) },
  });
  await refunds.process(f.refund.id, true);
  assert.equal(adapter.starts, 0);
  assert.equal(
    (await db.refund.findUniqueOrThrow({ where: { id: f.refund.id } })).status,
    'MANUAL_REVIEW',
  );
});

test('saved favourites merge idempotently, remain private and hide unapproved products', async () => {
  const f = await fixture(),
    other = await fixture();
  const discovery = new DiscoveryController(db),
    p = f.vendors[0].products[0];
  await discovery.save(f.user, { productId: p.id });
  await discovery.merge(f.user, { ids: [p.id, p.id, f.vendors[1].products[0].id] });
  assert.equal((await discovery.saved(f.user)).length, 2);
  assert.equal((await discovery.saved(other.user)).length, 0);
  await discovery.unsave(other.user, p.id);
  assert.equal((await discovery.saved(f.user)).length, 2);
  await db.product.update({ where: { id: p.id }, data: { status: 'DRAFT' } });
  assert.equal((await discovery.saved(f.user)).length, 1);
  await assert.rejects(discovery.save(other.user, { productId: p.id }));
});

test('price and stock alerts trigger only when eligible, exactly once across workers', async () => {
  const f = await fixture(0),
    discovery = new DiscoveryController(db),
    worker = new ShoppingAlertsService(db);
  const p = f.vendors[0].products[0],
    v = p.variants[0];
  const price = await discovery.alert(f.user, {
    variantId: v.id,
    kind: 'PRICE',
    targetMinor: 8000,
  });
  const stock = await discovery.alert(f.user, { variantId: v.id, kind: 'STOCK' });
  await worker.check();
  assert.equal(
    await db.outboxEvent.count({
      where: { id: { in: [`shopping-alert:${price.id}:1`, `shopping-alert:${stock.id}:1`] } },
    }),
    0,
  );
  await db.productVariant.update({
    where: { id: v.id },
    data: { priceMinor: 7500, stockQty: 2, reservedQty: 2 },
  });
  await Promise.all([worker.check(), worker.check()]);
  assert.equal(await db.outboxEvent.count({ where: { id: `shopping-alert:${price.id}:1` } }), 1);
  assert.equal((await db.productAlert.findUniqueOrThrow({ where: { id: stock.id } })).active, true);
  await db.productVariant.update({ where: { id: v.id }, data: { reservedQty: 1 } });
  await Promise.all([worker.check(), worker.check()]);
  assert.equal(await db.outboxEvent.count({ where: { id: `shopping-alert:${stock.id}:1` } }), 1);
  await assert.rejects(discovery.alert(f.user, { variantId: v.id, kind: 'STOCK' }));
  await assert.rejects(
    discovery.alert(f.user, { variantId: v.id, kind: 'PRICE', targetMinor: 9000 }),
  );
  const rearmed = await discovery.alert(f.user, {
    variantId: v.id,
    kind: 'PRICE',
    targetMinor: 7000,
  });
  assert.equal(rearmed.generation, 2);
  await db.productVariant.update({ where: { id: v.id }, data: { priceMinor: 6500 } });
  await worker.check();
  assert.equal(await db.outboxEvent.count({ where: { id: `shopping-alert:${price.id}:2` } }), 1);
});

test('alerts enforce account ownership and do not advertise suspended stores', async () => {
  const f = await fixture(),
    other = await fixture(),
    discovery = new DiscoveryController(db);
  const v = f.vendors[0].products[0].variants[0];
  const alert = await discovery.alert(f.user, {
    variantId: v.id,
    kind: 'PRICE',
    targetMinor: 9000,
  });
  await assert.rejects(discovery.cancelAlert(other.user, alert.id));
  assert.equal((await discovery.alerts(other.user)).length, 0);
  await db.productVariant.update({ where: { id: v.id }, data: { priceMinor: 8000 } });
  await db.vendor.update({ where: { id: f.vendors[0].id }, data: { status: 'SUSPENDED' } });
  await new ShoppingAlertsService(db).check();
  assert.equal((await db.productAlert.findUniqueOrThrow({ where: { id: alert.id } })).active, true);
  await discovery.cancelAlert(f.user, alert.id);
});

test('store follows and recommendations remain active, personalized and deduplicated', async () => {
  const f = await fixture(),
    discovery = new DiscoveryController(db);
  await discovery.follow(f.user, f.vendors[0].id);
  await discovery.follow(f.user, f.vendors[0].id);
  assert.equal((await discovery.following(f.user)).length, 1);
  const saved = f.vendors[0].products[0];
  await discovery.save(f.user, { productId: saved.id });
  const recs = await discovery.recommendations(f.user);
  assert.ok(recs.items.length > 0);
  assert.ok(recs.items.every((p) => p.id !== saved.id && p.status === 'ACTIVE'));
  assert.equal(new Set(recs.items.map((p) => p.id)).size, recs.items.length);
  await db.vendor.update({ where: { id: f.vendors[0].id }, data: { status: 'SUSPENDED' } });
  assert.equal((await discovery.following(f.user)).length, 0);
  await assert.rejects(discovery.follow(f.user, f.vendors[0].id));
});

test('price history records actual changes and hides draft product history', async () => {
  const f = await fixture(),
    scope = new VendorScope(db),
    owned = await scope.get(f.owner, true);
  const p = f.vendors.find((v) => v.id === owned.id)!.products[0],
    discovery = new DiscoveryController(db);
  await new VendorCatalogController(db, scope).edit(f.owner, p.id, { priceMinor: 9000 });
  await assert.rejects(discovery.prices(p.variants[0].id));
  await db.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } });
  const history = await discovery.prices(p.variants[0].id);
  assert.equal(history.currentMinor, 9000);
  assert.deepEqual(
    history.points.map((point) => point.priceMinor),
    [p.variants[0].priceMinor, 9000],
  );
});

test('seller analytics scope sales and ledger earnings to the owning store', async () => {
  const f = await fixture(),
    report = new AnalyticsController(db, scope),
    owned = await scope.get(f.owner, true);
  const result = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE' },
    randomUUID(),
  );
  await pay(result.orderId);
  await db.vendorLedgerEntry.create({
    data: {
      vendorId: owned.id,
      type: 'SALE',
      amountMinor: 1234,
      refId: `analytics:${randomUUID()}`,
    },
  });
  const data = await report.report(f.owner, '14');
  assert.equal(data.summary.orders, 1);
  assert.equal(data.summary.netEarnedMinor, 1234);
  assert.equal(data.series.length, 14);
  assert.equal(data.topProducts.length, 1);
  assert.equal(
    data.summary.salesMinor,
    f.vendors.find((v) => v.id === owned.id)!.products[0].variants[0].priceMinor,
  );
  await assert.rejects(report.report(f.user, 14));
  await assert.rejects(report.report(f.owner, 365));
});

async function approveBusiness(f: Awaited<ReturnType<typeof fixture>>) {
  const business = new BusinessController(db, scope);
  await business.apply(f.user, {
    legalName: 'Contract Buying Ltd',
    registrationNumber: 'BIZ-2026-TEST',
    billingAddress: 'Dhaka business district, road 12',
  });
  await business.review(f.user.id, {
    status: 'APPROVED',
    reviewNote: 'Contract business verified',
  });
  return business;
}
test('wholesale tiers apply only to approved buyers and match checkout snapshots', async () => {
  const f = await fixture(50),
    business = await approveBusiness(f),
    owned = await scope.get(f.owner, true),
    v = f.vendors.find((v) => v.id === owned.id)!.products[0].variants[0];
  await business.setTiers(f.owner, v.id, {
    tiers: [
      { minQty: 3, unitPriceMinor: 8000 },
      { minQty: 10, unitPriceMinor: 7000 },
    ],
  });
  await db.cartItem.updateMany({ where: { cartId: f.cart.id, variantId: v.id }, data: { qty: 3 } });
  const preview = await checkout.preview(f.user, {});
  assert.equal(preview.items.find((i) => i.variantId === v.id)!.variant.priceMinor, 8000);
  await db.businessProfile.update({ where: { userId: f.user.id }, data: { status: 'REJECTED' } });
  assert.equal(
    (await checkout.preview(f.user, {})).items.find((i) => i.variantId === v.id)!.variant
      .priceMinor,
    v.priceMinor,
  );
  await business.review(f.user.id, { status: 'APPROVED', reviewNote: 'Verified once more' });
  const placed = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE' },
    randomUUID(),
  );
  assert.equal(
    (
      await db.orderLine.findFirstOrThrow({
        where: { vendorOrder: { orderId: placed.orderId }, variantId: v.id },
      })
    ).unitPriceMinor,
    8000,
  );
  await assert.rejects(business.setTiers((await fixture()).owner, v.id, { tiers: [] }));
  await assert.rejects(
    business.setTiers(f.owner, v.id, {
      tiers: [
        { minQty: 3, unitPriceMinor: 8000 },
        { minQty: 10, unitPriceMinor: 9000 },
      ],
    }),
  );
});
test('negotiated quotes are private, single-use, expire and preserve the ordinary bag', async () => {
  const f = await fixture(50),
    other = await fixture(),
    business = await approveBusiness(f),
    owned = await scope.get(f.owner, true),
    v = f.vendors.find((v) => v.id === owned.id)!.products[0].variants[0];
  const q = await business.request(f.user, {
    variantId: v.id,
    qty: 5,
    note: 'Please quote for our office procurement',
  });
  await assert.rejects(
    business.offer(other.owner, q.id, {
      unitPriceMinor: 7000,
      expiresDays: 7,
      sellerNote: 'Unauthorized offer',
    }),
  );
  await business.offer(f.owner, q.id, {
    unitPriceMinor: 7000,
    expiresDays: 7,
    sellerNote: 'Five units with standard delivery',
  });
  await assert.rejects(business.decide(other.user, q.id, { accept: true }));
  await db.quoteRequest.update({ where: { id: q.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(business.decide(f.user, q.id, { accept: true }));
  await business.offer(f.owner, q.id, {
    unitPriceMinor: 7000,
    expiresDays: 7,
    sellerNote: 'Refreshed valid business offer',
  });
  await business.decide(f.user, q.id, { accept: true });
  await assert.rejects(checkout.preview(other.user, { quoteId: q.id }));
  const placed = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', quoteId: q.id },
    randomUUID(),
  );
  const replay = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', quoteId: q.id },
    randomUUID(),
  );
  assert.equal(replay.orderId, placed.orderId);
  await pay(placed.orderId);
  assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 2);
  const snapshot = await db.order.findUniqueOrThrow({
    where: { id: placed.orderId },
    include: { vendorOrders: { include: { lines: true } } },
  });
  assert.equal(snapshot.goodsMinor, 35000);
  assert.equal(snapshot.sourceKind, 'QUOTE');
  assert.equal(snapshot.vendorOrders.length, 1);
  assert.equal(snapshot.vendorOrders[0].lines[0].qty, 5);
  await assert.rejects(
    business.offer(f.owner, q.id, {
      unitPriceMinor: 6000,
      expiresDays: 7,
      sellerNote: 'Cannot alter an accepted order',
    }),
  );
});
test('replenishment cycles are concurrent-safe, require checkout approval and release failed orders', async () => {
  const f = await fixture(50),
    subscriptions = new SubscriptionsController(db),
    v = f.vendors[0].products[0].variants[0];
  const s = await subscriptions.create(f.user, {
    variantId: v.id,
    qty: 2,
    intervalDays: 30,
    startNow: true,
  });
  await Promise.all([prepareRenewals(db), prepareRenewals(db)]);
  const renewal = await db.subscriptionRenewal.findFirstOrThrow({
    where: { subscriptionId: s.id },
  });
  assert.equal(await db.subscriptionRenewal.count({ where: { subscriptionId: s.id } }), 1);
  assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
  const placed = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', renewalId: renewal.id },
    randomUUID(),
  );
  await checkout.cancelPending(placed.orderId);
  assert.equal(
    (await db.subscriptionRenewal.findUniqueOrThrow({ where: { id: renewal.id } })).status,
    'DUE',
  );
  const again = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', renewalId: renewal.id },
    randomUUID(),
  );
  assert.notEqual(again.orderId, placed.orderId);
  await pay(again.orderId);
  assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 2);
  const stranger = (await fixture()).user;
  await assert.rejects(subscriptions.change(stranger, s.id, { status: 'CANCELLED' }));
  await subscriptions.change(f.user, s.id, { status: 'PAUSED' });
  await db.subscription.update({ where: { id: s.id }, data: { nextAt: new Date(0) } });
  await prepareRenewals(db);
  assert.equal(await db.subscriptionRenewal.count({ where: { subscriptionId: s.id } }), 1);
  await subscriptions.change(f.user, s.id, { status: 'CANCELLED' });
  await assert.rejects(subscriptions.change(f.user, s.id, { status: 'ACTIVE' }));
});
test('loyalty redemption prevents concurrent overspending and vouchers are private and single-use', async () => {
  const f = await fixture(),
    other = await fixture(),
    rewards = new RewardsController(db);
  await db.rewardEntry.create({
    data: { userId: f.user.id, points: 100, type: 'CONTRACT_CREDIT', ref: randomUUID() },
  });
  const result = await Promise.allSettled([rewards.redeem(f.user), rewards.redeem(f.user)]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  const voucher = await db.coupon.findFirstOrThrow({ where: { ownerId: f.user.id } });
  await assert.rejects(checkout.preview(other.user, { couponCode: voucher.code }));
  const first = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', couponCode: voucher.code },
    randomUUID(),
  );
  await assert.rejects(checkout.preview(f.user, { couponCode: voucher.code }));
  await checkout.cancelPending(first.orderId);
  assert.equal((await checkout.preview(f.user, { couponCode: voucher.code })).discountMinor, 10000);
  const second = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE', couponCode: voucher.code },
    randomUUID(),
  );
  await pay(second.orderId);
  assert.equal((await rewards.summary(f.user)).points, 0);
  assert.equal((await rewards.summary(f.user)).coupons.length, 0);
});
test('delivery earns loyalty and referral rewards once, and returns claw both back', async () => {
  const f = await fixture(),
    friend = await fixture(),
    rewards = new RewardsController(db),
    code = (await rewards.summary(friend.user)).referralCode;
  await assert.rejects(rewards.claim(friend.user, { code }));
  await rewards.claim(f.user, { code });
  await assert.rejects(rewards.claim(f.user, { code }));
  for (let i = 0; i < 2; i++)
    await db.productVariant.update({
      where: { id: f.vendors[i].products[0].variants[0].id },
      data: { priceMinor: 50000 + i * 10000 },
    });
  const order = await checkout.start(
    f.user,
    { addressId: f.address.id, provider: 'FAKE' },
    randomUUID(),
  );
  await pay(order.orderId);
  assert.equal((await rewards.summary(f.user)).points, 0);
  const shipments = await db.vendorOrder.findMany({ where: { orderId: order.orderId } }),
    admin = { ...f.user, role: 'PLATFORM_ADMIN' };
  for (const vo of shipments) {
    await orders.transition(admin, vo.id, 'PROCESSING');
    await orders.transition(admin, vo.id, 'SHIPPED', 'GROWTH-TEST');
    await orders.transition(admin, vo.id, 'DELIVERED');
    await orders.transition(admin, vo.id, 'DELIVERED');
  }
  assert.equal((await rewards.summary(f.user)).points, 111);
  assert.equal((await rewards.summary(friend.user)).points, 100);
  const redeemed = await rewards.redeem(friend.user);
  const returned = await returns.request(f.user, {
    vendorOrderId: shipments[0].id,
    reason: 'The item needs a complete return',
  });
  await returns.review(returned.id, { status: 'APPROVED' });
  await returns.review(returned.id, { status: 'ITEM_RECEIVED' });
  const refund = await db.refund.findUniqueOrThrow({ where: { returnRequestId: returned.id } });
  await refunds.process(refund.id, true);
  await refunds.process(refund.id, true);
  assert.equal((await rewards.summary(friend.user)).points, -100);
  await assert.rejects(checkout.preview(friend.user, { couponCode: redeemed.code }));
  assert.ok((await rewards.summary(f.user)).points <= 6);
  assert.equal(
    (await db.referral.findUniqueOrThrow({ where: { inviteeId: f.user.id } })).status,
    'REVERSED',
  );
});
test('marketing requires explicit double opt-in and campaign preparation is idempotent', async () => {
  const original = process.env.SMTP_URL;
  process.env.SMTP_URL = 'smtp://contract.test';
  try {
    const marketing = new MarketingController(db),
      email = `marketing-${randomUUID()}@test.local`;
    await assert.rejects(marketing.subscribe({ email, consent: false }));
    await marketing.subscribe({ email, consent: true });
    const subscriber = await db.marketingSubscriber.findUniqueOrThrow({ where: { email } }),
      token = decrypt(subscriber.tokenCipher, config.BANK_ENCRYPTION_KEY);
    const pending = await marketing.create({
      title: 'Contract campaign',
      body: 'A thoughtful selection for confirmed subscribers only.',
      audience: 'ALL',
    });
    await marketing.schedule(pending.id, {});
    await prepareCampaigns(db);
    assert.equal(
      await db.outboxEvent.count({ where: { id: `campaign:${pending.id}:${subscriber.id}` } }),
      0,
    );
    await marketing.confirm({ token });
    await marketing.confirm({ token });
    const campaign = await marketing.create({
      title: 'Confirmed contract campaign',
      body: 'A thoughtful selection for confirmed subscribers only.',
      audience: 'ALL',
    });
    await marketing.schedule(campaign.id, {});
    await Promise.all([prepareCampaigns(db), prepareCampaigns(db)]);
    assert.equal(
      await db.outboxEvent.count({ where: { id: `campaign:${campaign.id}:${subscriber.id}` } }),
      1,
    );
    await marketing.unsubscribe({ token });
    await assert.rejects(marketing.confirm({ token }));
    const later = await marketing.create({
      title: 'Suppressed contract campaign',
      body: 'Unsubscribed addresses must not receive this message.',
      audience: 'ALL',
    });
    await marketing.schedule(later.id, {});
    await prepareCampaigns(db);
    assert.equal(
      await db.outboxEvent.count({ where: { id: `campaign:${later.id}:${subscriber.id}` } }),
      0,
    );
    await marketing.cancel(campaign.id);
    assert.equal(
      (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status,
      'CANCELLED',
    );
  } finally {
    if (original === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = original;
  }
});

test('campaign delivery rechecks unsubscribe and cancellation after messages were queued', async () => {
  const original = process.env.SMTP_URL;
  process.env.SMTP_URL = 'smtp://contract.test';
  try {
    await db.outboxEvent.updateMany({
      where: { processedAt: null },
      data: { processedAt: new Date() },
    });
    const marketing = new MarketingController(db),
      email = `dispatch-${randomUUID()}@test.local`;
    await marketing.subscribe({ email, consent: true });
    const subscriber = await db.marketingSubscriber.findUniqueOrThrow({ where: { email } }),
      token = decrypt(subscriber.tokenCipher, config.BANK_ENCRYPTION_KEY);
    await marketing.confirm({ token });
    const deliveries: string[] = [];
    const jobs = new JobsService(
      db,
      checkout,
      refunds,
      { notify() {} } as never,
      {
        deliver: async (_id: string, data: { subject: string; email: string }) => {
          if (data.email === email) deliveries.push(data.subject);
        },
      } as never,
      { invalidate: async () => {}, purge: async () => {} } as never,
      registry,
    );
    const c = await marketing.create({
      title: `Unsubscribe ${randomUUID()}`,
      body: 'Do not deliver after consent has been withdrawn.',
      audience: 'ALL',
    });
    await marketing.schedule(c.id, {});
    await prepareCampaigns(db);
    await marketing.unsubscribe({ token });
    await jobs.tick();
    assert.equal(deliveries.includes(`Bazaar · ${c.title}`), false);
    assert.ok(
      (
        await db.outboxEvent.findUniqueOrThrow({
          where: { id: `campaign:${c.id}:${subscriber.id}` },
        })
      ).processedAt,
    );
    await marketing.subscribe({ email, consent: true });
    await marketing.confirm({ token });
    const cancelled = await marketing.create({
      title: `Cancelled ${randomUUID()}`,
      body: 'Do not deliver after an administrator cancels a queued campaign.',
      audience: 'ALL',
    });
    await marketing.schedule(cancelled.id, {});
    await prepareCampaigns(db);
    await marketing.cancel(cancelled.id);
    await jobs.tick();
    assert.equal(deliveries.includes(`Bazaar · ${cancelled.title}`), false);
    const allowed = await marketing.create({
      title: `Allowed ${randomUUID()}`,
      body: 'This confirmed subscriber should receive the queued message.',
      audience: 'ALL',
    });
    await marketing.schedule(allowed.id, {});
    await prepareCampaigns(db);
    await jobs.tick();
    assert.equal(deliveries.filter((s) => s === `Bazaar · ${allowed.title}`).length, 1);
    await jobs.tick();
    assert.equal(deliveries.filter((s) => s === `Bazaar · ${allowed.title}`).length, 1);
  } finally {
    if (original === undefined) delete process.env.SMTP_URL;
    else process.env.SMTP_URL = original;
  }
});
