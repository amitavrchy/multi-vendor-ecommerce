import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commission, allocate, couponDiscount } from '../src/common/money';
import { masterStatus, fulfillment } from '../src/common/states';
import { encrypt, decrypt } from '../src/common/security';
import { CodProvider } from '../src/modules/payments/providers/cod.provider';
test('commission uses integer minor units and rejects invalid rates', () => {
  assert.equal(commission(19999, 1000), 2000);
  assert.equal(commission(10000, 0), 0);
  assert.equal(commission(10000, 10000), 10000);
  assert.throws(() => commission(-1, 1000));
  assert.throws(() => commission(100, 10001));
});
test('discount allocation preserves every minor unit', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [33, 33, 34]);
  assert.equal(
    allocate(101, [999, 4321, 582]).reduce((s, x) => s + x, 0),
    101,
  );
});
test('discount allocations cannot overdraw a small final line and preserve large integer totals', () => {
  const parts = allocate(
    999,
    Array.from({ length: 1000 }, () => 1),
  );
  assert.equal(
    parts.reduce((a, b) => a + b, 0),
    999,
  );
  assert.ok(parts.every((p) => p <= 1));
  assert.equal(
    allocate(2000000000, [1000000000, 999999999, 1]).reduce((a, b) => a + b, 0),
    2000000000,
  );
});
test('coupons respect minimum spend and discount cap', () => {
  const c = { percent: 10, maxDiscountMinor: 100000, minGoodsMinor: 100000 };
  assert.equal(couponDiscount(99999, c), 0);
  assert.equal(couponDiscount(150000, c), 15000);
  assert.equal(couponDiscount(5000000, c), 100000);
});
test('master fulfillment tolerates independently cancelled vendors', () => {
  assert.equal(masterStatus(['DELIVERED', 'CANCELLED']), 'FULFILLED');
  assert.equal(masterStatus(['SHIPPED', 'PROCESSING']), 'PARTIALLY_FULFILLED');
  assert.equal(masterStatus(['CANCELLED', 'CANCELLED']), 'CANCELLED');
  assert.ok(!fulfillment.DELIVERED.includes('PROCESSING'));
});
test('bank encryption roundtrips and authenticates its ciphertext', () => {
  const key = '12'.repeat(32);
  const value = encrypt('Bank details', key);
  assert.equal(decrypt(value, key), 'Bank details');
  assert.notEqual(value, encrypt('Bank details', key));
  assert.throws(() => decrypt(value, '34'.repeat(32)));
});
test('COD never accepts payment webhooks or pretends a refund was transferred', async () => {
  const p = new CodProvider();
  const i = await p.createIntent({
    orderId: 'o1',
    amountMinor: 10000,
    currency: 'BDT',
    idempotencyKey: 'k',
    email: 'x@example.test',
  });
  assert.equal(i.status, 'COD_PENDING');
  await assert.rejects(() => p.parseWebhook());
  assert.equal((await p.refund('o1', 100, 'key')).status, 'PENDING');
});
