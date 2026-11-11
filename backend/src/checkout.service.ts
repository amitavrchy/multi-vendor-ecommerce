import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { Principal } from './auth/access';
import { config } from './config';
import { allocate, commission, couponDiscount, SHIPPING_MINOR } from './common/money';
import { ProviderRegistry } from './modules/payments/registry';
import { IntentResult } from './modules/payments/provider';
export async function finishReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
  consume: boolean,
) {
  const rows = await tx.stockReservation.findMany({ where: { orderId, status: 'RESERVED' } });
  for (const row of rows) {
    await tx.productVariant.update({
      where: { id: row.variantId },
      data: {
        reservedQty: { decrement: row.qty },
        ...(consume ? { stockQty: { decrement: row.qty } } : {}),
      },
    });
    await tx.stockReservation.update({
      where: { id: row.id },
      data: { status: consume ? 'CONSUMED' : 'RELEASED' },
    });
  }
}
export async function clearPurchasedCart(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
) {
  const rows = await tx.stockReservation.findMany({ where: { orderId } });
  for (const r of rows)
    await tx.cartItem.deleteMany({
      where: { cart: { userId }, variantId: r.variantId, qty: r.qty },
    });
}
@Injectable()
export class CheckoutService {
  constructor(
    private db: Db,
    private providers: ProviderRegistry,
  ) {}
  async start(
    user: Principal,
    data: { addressId: string; provider: string; couponCode?: string },
    key: string,
  ) {
    const previous = await this.db.payment.findUnique({ where: { idempotencyKey: key } });
    if (previous) {
      const order = await this.db.order.findUniqueOrThrow({ where: { id: previous.orderId } });
      if (order.userId !== user.id)
        throw new ConflictException('Idempotency key belongs to another request');
      if (previous.status !== 'CREATED')
        return { orderId: order.id, intent: previous.raw, status: previous.status };
    }
    const provider = this.providers.get(data.provider);
    const order = previous
      ? await this.db.order.findUniqueOrThrow({ where: { id: previous.orderId } })
      : await this.db.atomic(async (tx) => {
          const address = await tx.address.findFirst({
            where: { id: data.addressId, userId: user.id },
          });
          if (!address) throw new BadRequestException('Choose your shipping address');
          const cart = await tx.cart.findUnique({
            where: { userId: user.id },
            include: {
              items: {
                include: {
                  variant: { include: { product: { include: { vendor: true, category: true } } } },
                },
              },
            },
          });
          if (!cart?.items.length) throw new BadRequestException('Your bag is empty');
          const groups = new Map<string, typeof cart.items>();
          for (const item of cart.items) {
            if (
              item.variant.product.status !== 'ACTIVE' ||
              item.variant.product.vendor.status !== 'ACTIVE'
            )
              throw new BadRequestException('An item is no longer available');
            const id = item.variant.product.vendorId;
            groups.set(id, [...(groups.get(id) || []), item]);
          }
          const goodsMinor = cart.items.reduce((s, i) => s + i.qty * i.variant.priceMinor, 0);
          const coupon = data.couponCode
            ? await tx.coupon.findFirst({
                where: {
                  code: data.couponCode.toUpperCase(),
                  active: true,
                  expiresAt: { gt: new Date() },
                },
              })
            : null;
          if (data.couponCode && (!coupon || goodsMinor < coupon.minGoodsMinor))
            throw new BadRequestException('Coupon is invalid or minimum spend has not been met');
          const discountMinor = coupon ? couponDiscount(goodsMinor, coupon) : 0;
          const groupArray = [...groups.entries()];
          const totals = groupArray.map(([, items]) =>
            items.reduce((s, i) => s + i.qty * i.variant.priceMinor, 0),
          );
          const discounts = allocate(discountMinor, totals);
          const shippingMinor = groups.size * SHIPPING_MINOR;
          const created = await tx.order.create({
            data: {
              userId: user.id,
              goodsMinor,
              shippingMinor,
              discountMinor,
              grandMinor: goodsMinor + shippingMinor - discountMinor,
              shippingAddress: address,
              couponCode: coupon?.code,
            },
          });
          for (let n = 0; n < groupArray.length; n++) {
            const [vendorId, items] = groupArray[n];
            const commissionMinor = items.reduce(
              (s, i) =>
                s +
                commission(
                  i.qty * i.variant.priceMinor,
                  i.variant.product.category.commissionBps ??
                    i.variant.product.vendor.commissionBps,
                ),
              0,
            );
            await tx.vendorOrder.create({
              data: {
                orderId: created.id,
                vendorId,
                goodsMinor: totals[n],
                shippingMinor: SHIPPING_MINOR,
                discountMinor: discounts[n],
                commissionMinor,
                vendorNetMinor: totals[n] - commissionMinor,
                lines: {
                  create: items.map((i) => ({
                    variantId: i.variantId,
                    titleSnapshot: i.variant.product.title,
                    imageSnapshot: i.variant.product.image,
                    unitPriceMinor: i.variant.priceMinor,
                    commissionBps:
                      i.variant.product.category.commissionBps ??
                      i.variant.product.vendor.commissionBps,
                    qty: i.qty,
                  })),
                },
              },
            });
          }
          // Conditional UPDATE locks each variant; all reservations roll back if one fails.
          for (const item of [...cart.items].sort((a, b) =>
            a.variantId.localeCompare(b.variantId),
          )) {
            const changed =
              await tx.$executeRaw`UPDATE "ProductVariant" SET "reservedQty" = "reservedQty" + ${item.qty} WHERE id = ${item.variantId} AND "stockQty" - "reservedQty" >= ${item.qty}`;
            if (changed !== 1)
              throw new BadRequestException(`${item.variant.product.title} has insufficient stock`);
            await tx.stockReservation.create({
              data: {
                variantId: item.variantId,
                qty: item.qty,
                orderId: created.id,
                expiresAt: new Date(Date.now() + config.RESERVATION_TTL_SECONDS * 1000),
              },
            });
          }
          await tx.payment.create({
            data: {
              orderId: created.id,
              provider: provider.code,
              amountMinor: created.grandMinor,
              idempotencyKey: key,
            },
          });
          await tx.outboxEvent.create({
            data: { type: 'PAYMENT_STARTED', payload: { orderId: created.id, userId: user.id } },
          });
          return created;
        });
    let intent: IntentResult;
    try {
      intent = await provider.createIntent({
        orderId: order.id,
        amountMinor: order.grandMinor,
        currency: order.currency,
        idempotencyKey: key,
        email: user.email,
      });
    } catch (error) {
      await this.cancelPending(order.id);
      throw error;
    }
    await this.db.atomic(async (tx) => {
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      if (current.status !== 'PENDING_PAYMENT')
        throw new ConflictException('Checkout expired; please try again');
      await tx.payment.update({
        where: { orderId: order.id },
        data: {
          providerRef: intent.providerRef,
          status: intent.status,
          raw: intent as unknown as Prisma.InputJsonValue,
        },
      });
      if (intent.status === 'COD_PENDING') {
        await finishReservations(tx, order.id, true);
        await clearPurchasedCart(tx, order.id, user.id);
        await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
        await tx.vendorOrder.updateMany({
          where: { orderId: order.id },
          data: { status: 'AWAITING_FULFILLMENT' },
        });
        await tx.outboxEvent.create({
          data: { type: 'ORDER_CONFIRMED', payload: { orderId: order.id, userId: user.id } },
        });
      }
    });
    return { orderId: order.id, intent, status: intent.status };
  }
  async cancelPending(orderId: string) {
    await this.db.atomic(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== 'PENDING_PAYMENT') return;
      await finishReservations(tx, orderId, false);
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
      await tx.vendorOrder.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } });
      await tx.payment.update({ where: { orderId }, data: { status: 'CANCELLED' } });
    });
  }
}
