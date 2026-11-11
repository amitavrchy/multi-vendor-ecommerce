import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal } from './auth/access';
import { input } from './common/input';
import { couponDiscount, SHIPPING_MINOR } from './common/money';
@Controller('cart')
export class CartController {
  constructor(private db: Db) {}
  @Get() async get(@Actor() u: Principal) {
    return (
      (await this.db.cart.findUnique({
        where: { userId: u.id },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    include: { vendor: { select: { id: true, storeName: true, status: true } } },
                  },
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      })) || { items: [] }
    );
  }
  @Post('items') async set(@Actor() u: Principal, @Body() body: unknown) {
    const d = input(
      z.object({ variantId: z.string(), qty: z.number().int().min(1).max(99) }),
      body,
    );
    const variant = await this.db.productVariant.findUnique({
      where: { id: d.variantId },
      include: { product: { include: { vendor: true } } },
    });
    if (
      !variant ||
      variant.product.status !== 'ACTIVE' ||
      variant.product.vendor.status !== 'ACTIVE'
    )
      throw new BadRequestException('This item is unavailable');
    if (variant.stockQty - variant.reservedQty < d.qty)
      throw new BadRequestException('Not enough stock available');
    const cart = await this.db.cart.upsert({
      where: { userId: u.id },
      create: { userId: u.id },
      update: {},
    });
    return this.db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: d.variantId } },
      create: { cartId: cart.id, ...d },
      update: { qty: d.qty },
    });
  }
  @Delete('items/:id') async remove(@Actor() u: Principal, @Param('id') id: string) {
    await this.db.cartItem.deleteMany({ where: { id, cart: { userId: u.id } } });
    return { ok: true };
  }
  @Post('quote') async quote(@Actor() u: Principal, @Body() b: unknown) {
    const { code } = input(z.object({ code: z.string().max(40).optional() }), b);
    const cart = await this.get(u);
    const goodsMinor = cart.items.reduce((s, i) => s + i.qty * i.variant.priceMinor, 0);
    const vendors = new Set(cart.items.map((i) => i.variant.product.vendorId));
    const coupon = code
      ? await this.db.coupon.findFirst({
          where: { code: code.toUpperCase(), active: true, expiresAt: { gt: new Date() } },
        })
      : null;
    if (code && (!coupon || goodsMinor < coupon.minGoodsMinor))
      throw new BadRequestException('Coupon is invalid or minimum spend has not been met');
    const discountMinor = coupon ? couponDiscount(goodsMinor, coupon) : 0;
    const shippingMinor = vendors.size * SHIPPING_MINOR;
    return {
      goodsMinor,
      discountMinor,
      shippingMinor,
      grandMinor: goodsMinor - discountMinor + shippingMinor,
    };
  }
}
