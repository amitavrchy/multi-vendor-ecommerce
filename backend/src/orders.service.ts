import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from './db';
import { Principal } from './auth/access';
import { fulfillment, masterStatus } from './common/states';
import { VendorScope } from './vendor-scope.service';
import { reconcileRewards } from './rewards.controller';
@Injectable()
export class OrdersService {
  constructor(
    private db: Db,
    private scope: VendorScope,
  ) {}
  async transition(u: Principal, id: string, status: string, trackingNumber?: string) {
    const vendor = u.role === 'PLATFORM_ADMIN' ? null : await this.scope.get(u);
    return this.db.atomic(async (tx) => {
      const vo = await tx.vendorOrder.findFirst({
        where: { id, ...(vendor ? { vendorId: vendor.id } : {}) },
        include: { order: { include: { payment: true } }, lines: true },
      });
      if (!vo) throw new NotFoundException();
      if (vo.status === status) return vo;
      if (!fulfillment[vo.status]?.includes(status))
        throw new BadRequestException('Invalid fulfillment transition');
      if (status === 'SHIPPED' && !trackingNumber?.trim())
        throw new BadRequestException('Add a tracking number');
      if (status === 'CANCELLED')
        throw new BadRequestException('Use the cancellation endpoint to arrange a refund');
      const updated = await tx.vendorOrder.update({
        where: { id },
        data: {
          status,
          ...(trackingNumber ? { trackingNumber } : {}),
          ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
      });
      if (status === 'DELIVERED') {
        const entry = await tx.vendorLedgerEntry.findUnique({ where: { refId: `delivery:${id}` } });
        if (!entry) {
          await tx.vendorLedgerEntry.create({
            data: {
              vendorId: vo.vendorId,
              type: 'SALE',
              amountMinor: vo.vendorNetMinor,
              refId: `delivery:${id}`,
            },
          });
          await tx.vendorBalance.upsert({
            where: { vendorId: vo.vendorId },
            create: { vendorId: vo.vendorId, availableMinor: vo.vendorNetMinor },
            update: { availableMinor: { increment: vo.vendorNetMinor } },
          });
        }
      }
      const all = await tx.vendorOrder.findMany({ where: { orderId: vo.orderId } });
      const state = masterStatus(all.map((v) => v.status));
      await tx.order.update({ where: { id: vo.orderId }, data: { status: state } });
      if (state === 'FULFILLED' && vo.order.payment?.status === 'COD_PENDING')
        await tx.payment.update({ where: { orderId: vo.orderId }, data: { status: 'SUCCEEDED' } });
      await reconcileRewards(tx, vo.orderId, `delivery:${id}`);
      await tx.outboxEvent.create({
        data: {
          type: 'ORDER_STATUS_CHANGED',
          payload: { orderId: vo.orderId, userId: vo.order.userId, vendorOrderId: id, status },
        },
      });
      return updated;
    });
  }
}
