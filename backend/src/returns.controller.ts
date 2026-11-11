import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal, Roles } from './auth/access';
import { input } from './common/input';
import { RefundsService } from './refunds.service';
@Controller('returns')
export class ReturnsController {
  constructor(
    private db: Db,
    private refunds: RefundsService,
  ) {}
  @Post() async request(@Actor() u: Principal, @Body() b: unknown) {
    const d = input(
      z.object({ vendorOrderId: z.string(), reason: z.string().trim().min(10).max(1000) }),
      b,
    );
    return this.db.atomic(async (tx) => {
      const vo = await tx.vendorOrder.findFirst({
        where: { id: d.vendorOrderId, order: { userId: u.id } },
        include: { lines: true },
      });
      if (!vo) throw new NotFoundException();
      if (
        vo.status !== 'DELIVERED' ||
        !vo.deliveredAt ||
        Date.now() - vo.deliveredAt.getTime() > 14 * 86400000
      )
        throw new BadRequestException('Returns are available within 14 days of delivery');
      if (await tx.returnRequest.findUnique({ where: { vendorOrderId: vo.id } }))
        throw new BadRequestException('A return already exists for this shipment');
      return tx.returnRequest.create({
        data: { ...d, lines: vo.lines.map((l) => ({ lineId: l.id, qty: l.qty })) },
      });
    });
  }
  @Get() list(@Actor() u: Principal) {
    return this.db.returnRequest.findMany({
      where: { vendorOrder: { order: { userId: u.id } } },
      include: { vendorOrder: { include: { lines: true } } },
    });
  }
  @Roles('PLATFORM_ADMIN', 'SUPPORT_AGENT') @Patch(':id') async review(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const d = input(
      z.object({
        status: z.enum(['APPROVED', 'REJECTED', 'ITEM_RECEIVED']),
        note: z.string().max(1000).optional(),
      }),
      b,
    );
    return this.db.atomic(async (tx) => {
      const r = await tx.returnRequest.findUnique({
        where: { id },
        include: { vendorOrder: { include: { order: { include: { payment: true } } } } },
      });
      if (!r) throw new NotFoundException();
      const allowed: Record<string, string[]> = {
        REQUESTED: ['APPROVED', 'REJECTED'],
        APPROVED: ['ITEM_RECEIVED'],
      };
      if (!allowed[r.status]?.includes(d.status))
        throw new BadRequestException('Invalid return transition');
      if (d.status === 'ITEM_RECEIVED') {
        const vo = r.vendorOrder;
        const payment = vo.order.payment!;
        const amountMinor = vo.goodsMinor - vo.discountMinor;
        if (!['SUCCEEDED', 'COD_PENDING'].includes(payment.status))
          throw new BadRequestException('Payment is not refundable');
        const refund = await tx.refund.create({
          data: {
            paymentId: payment.id,
            amountMinor,
            reason: `RETURN:${vo.id}`,
            idempotencyKey: `return:${id}`,
          },
        });
        await tx.outboxEvent.create({
          data: { type: 'REFUND_REQUESTED', payload: { refundId: refund.id } },
        });
      }
      return tx.returnRequest.update({ where: { id }, data: d });
    });
  }
  @Roles('PLATFORM_ADMIN') @Post('refunds/:id/confirm') async confirm(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const d = input(z.object({ transferReference: z.string().min(5).max(180) }), b);
    const r = await this.db.refund.findUnique({ where: { id } });
    if (!r || !['MANUAL_REVIEW', 'SUCCEEDED'].includes(r.status))
      throw new BadRequestException('Only manual refunds can be confirmed here');
    return this.refunds.complete(id, d.transferReference);
  }
}
