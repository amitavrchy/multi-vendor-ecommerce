export const SHIPPING_MINOR = 8000;
export function commission(goodsMinor: number, bps: number) {
  if (
    !Number.isSafeInteger(goodsMinor) ||
    goodsMinor < 0 ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 10000
  )
    throw new Error('Invalid commission input');
  return Math.round((goodsMinor * bps) / 10000);
}
export function couponDiscount(
  goods: number,
  coupon: { percent: number; maxDiscountMinor: number; minGoodsMinor: number },
) {
  if (goods < coupon.minGoodsMinor) return 0;
  return Math.min(Math.floor((goods * coupon.percent) / 100), coupon.maxDiscountMinor, goods);
}
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(sum) ||
    total < 0 ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0) ||
    (!sum && total)
  )
    throw new Error('Invalid allocation');
  if (!sum) return weights.map(() => 0);
  const divisor = BigInt(sum),
    numerator = BigInt(total);
  const values = weights.map((w) => Number((numerator * BigInt(w)) / divisor));
  let remainder = total - values.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, fraction: (numerator * BigInt(w)) % divisor }))
    .sort((a, b) => (a.fraction === b.fraction ? b.i - a.i : a.fraction > b.fraction ? -1 : 1));
  for (const { i } of order) {
    if (!remainder) break;
    values[i]++;
    remainder--;
  }
  return values;
}
