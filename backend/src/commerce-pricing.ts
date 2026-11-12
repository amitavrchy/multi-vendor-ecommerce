import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export type PurchaseSource = { quoteId?: string; renewalId?: string };
const include = {
  product: { include: { vendor: true, category: true } },
  wholesaleTiers: true,
} satisfies Prisma.ProductVariantInclude;
export async function purchaseItems(
  tx: Prisma.TransactionClient,
  userId: string,
  source: PurchaseSource = {},
) {
  if (source.quoteId && source.renewalId)
    throw new BadRequestException('Choose one purchase source');
  const business = await tx.businessProfile.findUnique({ where: { userId } });
  let selected: {
    id: string;
    variantId: string;
    qty: number;
    variant: Prisma.ProductVariantGetPayload<{ include: typeof include }>;
  }[];
  let agreedPrice: number | null = null;
  if (source.quoteId) {
    const quote = await tx.quoteRequest.findFirst({
      where: { id: source.quoteId, userId, status: 'ACCEPTED', expiresAt: { gt: new Date() } },
      include: { variant: { include } },
    });
    if (!quote || quote.unitPriceMinor === null || business?.status !== 'APPROVED')
      throw new BadRequestException('An approved business and valid accepted quote are required');
    selected = [
      { id: quote.id, variantId: quote.variantId, qty: quote.qty, variant: quote.variant },
    ];
    agreedPrice = quote.unitPriceMinor;
  } else if (source.renewalId) {
    const renewal = await tx.subscriptionRenewal.findFirst({
      where: {
        id: source.renewalId,
        status: 'DUE',
        subscription: { userId, status: { not: 'CANCELLED' } },
      },
      include: { subscription: { include: { variant: { include } } } },
    });
    if (!renewal) throw new BadRequestException('This renewal is unavailable or already ordered');
    selected = [
      {
        id: renewal.id,
        variantId: renewal.subscription.variantId,
        qty: renewal.subscription.qty,
        variant: renewal.subscription.variant,
      },
    ];
  } else {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: { items: { include: { variant: { include } } } },
    });
    selected = cart?.items || [];
  }
  if (!selected.length) throw new BadRequestException('Your bag is empty');
  return selected.map((item) => {
    if (item.variant.product.status !== 'ACTIVE' || item.variant.product.vendor.status !== 'ACTIVE')
      throw new BadRequestException('An item is no longer available');
    const tier =
      business?.status === 'APPROVED'
        ? item.variant.wholesaleTiers
            .filter((t) => t.minQty <= item.qty)
            .sort((a, b) => a.unitPriceMinor - b.unitPriceMinor)[0]
        : null;
    const priceMinor = Math.min(
      item.variant.priceMinor,
      agreedPrice ?? tier?.unitPriceMinor ?? item.variant.priceMinor,
    );
    return {
      ...item,
      variant: { ...item.variant, retailPriceMinor: item.variant.priceMinor, priceMinor },
    };
  });
}
export async function checkoutCoupon(
  tx: Prisma.TransactionClient,
  userId: string,
  code: string | undefined,
  goodsMinor: number,
) {
  if (!code) return null;
  const c = await tx.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (
    !c ||
    !c.active ||
    c.expiresAt <= new Date() ||
    goodsMinor < c.minGoodsMinor ||
    (c.ownerId && c.ownerId !== userId) ||
    (c.singleUse && c.claimedOrderId)
  )
    throw new BadRequestException(
      'Coupon is invalid, already used or unavailable for this account',
    );
  if (c.ownerId && c.singleUse) {
    const balance = await tx.rewardEntry.aggregate({ where: { userId }, _sum: { points: true } });
    if ((balance._sum.points || 0) < 0)
      throw new BadRequestException(
        'Reward vouchers are paused until your points balance is no longer negative',
      );
  }
  return c;
}
