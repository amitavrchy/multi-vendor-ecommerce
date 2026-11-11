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
  let used = 0;
  return weights.map((w, i) => {
    const amount = i === weights.length - 1 ? total - used : Math.floor((total * w) / sum);
    used += amount;
    return amount;
  });
}
