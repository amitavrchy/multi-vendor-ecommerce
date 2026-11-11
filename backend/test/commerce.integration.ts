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
