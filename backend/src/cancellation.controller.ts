import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal } from './auth/access';
import { input } from './common/input';
import { masterStatus } from './common/states';
import { VendorScope } from './vendor-scope.service';
@Controller('vendor-orders')
export class CancellationController {
  constructor(
    private db: Db,
    private scope: VendorScope,
  ) {}
  @Post(':id/cancel') async cancel(
    @Actor() u: Principal,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    input(z.object({ reason: z.string().min(5).max(500) }), b);
    const vendor = ['VENDOR_OWNER', 'VENDOR_STAFF'].includes(u.role)
      ? await this.scope.get(u)
      : null;
    return this.db.atomic(async (tx) => {
      const vo = await tx.vendorOrder.findFirst({
        where: {
          id,
          ...(u.role === 'PLATFORM_ADMIN'
            ? {}
            : vendor
              ? { vendorId: vendor.id }
              : { order: { userId: u.id } }),
        },
        include: { order: { include: { payment: true } }, lines: true },
      });
      if (!vo) throw new NotFoundException();
      if (vo.status === 'CANCELLED') return vo;
      if (!['AWAITING_FULFILLMENT', 'PROCESSING'].includes(vo.status))
        throw new BadRequestException('This shipment cannot be cancelled');
      await tx.vendorOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      for (const l of vo.lines)
        await tx.productVariant.update({
          where: { id: l.variantId },
          data: { stockQty: { increment: l.qty } },
        });
      const payment = vo.order.payment!;
      if (payment.status === 'SUCCEEDED') {
        const refund = await tx.refund.create({
          data: {
            paymentId: payment.id,
            amountMinor: vo.goodsMinor - vo.discountMinor + vo.shippingMinor,
            reason: `CANCEL:${id}`,
            idempotencyKey: `cancel:${id}`,
          },
        });
        await tx.outboxEvent.create({
          data: { type: 'REFUND_REQUESTED', payload: { refundId: refund.id } },
        });
      }
      const all = await tx.vendorOrder.findMany({ where: { orderId: vo.orderId } });
      const status = masterStatus(all.map((v) => v.status));
      await tx.order.update({ where: { id: vo.orderId }, data: { status } });
      if (status === 'CANCELLED' && payment.status === 'COD_PENDING')
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
      await tx.outboxEvent.create({
        data: {
          type: 'ORDER_STATUS_CHANGED',
          payload: { orderId: vo.orderId, userId: vo.order.userId, status: 'CANCELLED' },
        },
      });
      return { ok: true };
    });
  }
}
