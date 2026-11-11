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
import { commission } from './common/money';
@Controller('returns')
export class ReturnsController {
  constructor(
    private db: Db,
    private refunds: RefundsService,
  ) {}
  @Post() async request(@Actor() u: Principal, @Body() b: unknown) {
    const d = input(
      z.object({
        vendorOrderId: z.string(),
        reason: z.string().trim().min(10).max(1000),
        lines: z
          .array(z.object({ lineId: z.string(), qty: z.number().int().min(1).max(99) }))
          .min(1)
          .optional(),
      }),
      b,
    );
    return this.db.atomic(async (tx) => {
      const vo = await tx.vendorOrder.findFirst({
        where: { id: d.vendorOrderId, order: { userId: u.id } },
        include: { lines: true, returns: true },
      });
      if (!vo) throw new NotFoundException();
      const policy = await tx.platformPolicy.findUnique({ where: { id: 'marketplace' } });
      const windowDays = policy?.returnWindowDays ?? 14;
      if (
        vo.status !== 'DELIVERED' ||
        !vo.deliveredAt ||
        Date.now() - vo.deliveredAt.getTime() > windowDays * 86400000
      )
        throw new BadRequestException(
          `Returns are available within ${windowDays} days of delivery`,
        );
      const requested = d.lines || vo.lines.map((l) => ({ lineId: l.id, qty: l.qty }));
      if (new Set(requested.map((l) => l.lineId)).size !== requested.length)
        throw new BadRequestException('Duplicate return lines');
      let goodsMinor = 0;
      for (const line of requested) {
        const original = vo.lines.find((l) => l.id === line.lineId);
        if (!original) throw new BadRequestException('Unknown order line');
        const reserved = vo.returns
          .filter((r) => r.status !== 'REJECTED')
          .flatMap((r) => r.lines as { lineId: string; qty: number }[])
          .filter((l) => l.lineId === line.lineId)
          .reduce((s, l) => s + l.qty, 0);
        if (line.qty + reserved > original.qty)
          throw new BadRequestException('Return quantity exceeds remaining purchased quantity');
        goodsMinor += line.qty * original.unitPriceMinor;
      }
      const restockingFeeMinor = commission(goodsMinor, policy?.restockingBps ?? 0);
      const clawbackMinor = Math.max(
        0,
        Math.floor((vo.vendorNetMinor * goodsMinor) / vo.goodsMinor) - restockingFeeMinor,
      );
      return tx.returnRequest.create({
        data: {
          vendorOrderId: d.vendorOrderId,
          reason: d.reason,
          lines: requested,
          restockingFeeMinor,
          clawbackMinor,
        },
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
        include: {
          vendorOrder: { include: { lines: true, order: { include: { payment: true } } } },
        },
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
        const returnedGoods = (r.lines as { lineId: string; qty: number }[]).reduce(
          (s, l) => s + l.qty * vo.lines.find((v) => v.id === l.lineId)!.unitPriceMinor,
          0,
        );
        const amountMinor =
          returnedGoods -
          Math.floor((vo.discountMinor * returnedGoods) / vo.goodsMinor) -
          r.restockingFeeMinor;
        if (amountMinor <= 0) throw new BadRequestException('This return has no refundable amount');
        if (!['SUCCEEDED', 'COD_PENDING'].includes(payment.status))
          throw new BadRequestException('Payment is not refundable');
        const refund = await tx.refund.create({
          data: {
            paymentId: payment.id,
            amountMinor,
            reason: `RETURN:${vo.id}`,
            idempotencyKey: `return:${id}`,
            returnRequestId: id,
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
