import { BadRequestException, Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Roles } from './auth/access';
import { input } from './common/input';
import { decrypt } from './common/security';
import { config } from './config';
@Roles('PLATFORM_ADMIN')
@Controller('payouts')
export class PayoutsController {
  constructor(private db: Db) {}
  @Header('Cache-Control', 'no-store')
  @Get(':id/instructions')
  async instructions(@Param('id') id: string) {
    const batch = await this.db.payoutBatch.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { vendorOrder: { include: { vendor: true } } } } },
    });
    const accounts = new Map<
      string,
      { storeName: string; amountMinor: number; bankDetails: string }
    >();
    for (const item of batch.items) {
      const vendor = item.vendorOrder.vendor;
      const account = accounts.get(vendor.id) || {
        storeName: vendor.storeName,
        amountMinor: 0,
        bankDetails: vendor.bankEncrypted
          ? decrypt(vendor.bankEncrypted, config.BANK_ENCRYPTION_KEY)
          : 'No bank account configured',
      };
      account.amountMinor += item.amountMinor;
      accounts.set(vendor.id, account);
    }
    return [...accounts.values()];
  }
  @Get() list() {
    return this.db.payoutBatch.findMany({
      include: {
        items: {
          include: { vendorOrder: { include: { vendor: { select: { storeName: true } } } } },
        },
      },
      orderBy: { scheduledFor: 'desc' },
      take: 50,
    });
  }
  @Post('run') async run(scheduleKey?: string) {
    return this.db.atomic(async (tx) => {
      if (scheduleKey) {
        const existing = await tx.payoutBatch.findUnique({ where: { scheduleKey } });
        if (existing) return existing;
      }
      const orders = await tx.vendorOrder.findMany({
        where: {
          status: 'DELIVERED',
          payout: null,
          returns: { none: { status: { in: ['REQUESTED', 'APPROVED', 'ITEM_RECEIVED'] } } },
          vendor: { status: 'ACTIVE', bankEncrypted: { not: null } },
        },
        include: { returns: true },
      });
      const eligible: ((typeof orders)[number] & { payoutMinor: number })[] = [];
      const remaining = new Map<string, number>();
      for (const o of orders) {
        if (!remaining.has(o.vendorId))
          remaining.set(
            o.vendorId,
            (await tx.vendorBalance.findUnique({ where: { vendorId: o.vendorId } }))
              ?.availableMinor || 0,
          );
        const payoutMinor = Math.max(
          0,
          o.vendorNetMinor -
            o.returns
              .filter((r) => r.status === 'REFUNDED')
              .reduce((s, r) => s + r.clawbackMinor, 0),
        );
        if (payoutMinor > 0 && remaining.get(o.vendorId)! >= payoutMinor) {
          eligible.push({ ...o, payoutMinor });
          remaining.set(o.vendorId, remaining.get(o.vendorId)! - payoutMinor);
        }
      }
      if (!eligible.length)
        throw new BadRequestException('No eligible delivered orders with verified bank details');
      const batch = await tx.payoutBatch.create({ data: { status: 'OPEN', scheduleKey } });
      for (const o of eligible) {
        await tx.payoutItem.create({
          data: {
            batchId: batch.id,
            vendorId: o.vendorId,
            vendorOrderId: o.id,
            amountMinor: o.payoutMinor,
          },
        });
        await tx.vendorBalance.update({
          where: { vendorId: o.vendorId },
          data: {
            availableMinor: { decrement: o.payoutMinor },
            pendingMinor: { increment: o.payoutMinor },
          },
        });
      }
      return batch;
    });
  }
  @Post(':id/confirm') async confirm(@Param('id') id: string, @Body() b: unknown) {
    const d = input(z.object({ transferReference: z.string().min(5).max(150) }), b);
    return this.db.atomic(async (tx) => {
      const batch = await tx.payoutBatch.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (batch.status === 'PAID') return batch;
      for (const item of batch.items) {
        await tx.vendorBalance.update({
          where: { vendorId: item.vendorId },
          data: { pendingMinor: { decrement: item.amountMinor } },
        });
        await tx.vendorLedgerEntry.create({
          data: {
            vendorId: item.vendorId,
            type: 'PAYOUT',
            amountMinor: -item.amountMinor,
            refId: `payout:${item.id}:${d.transferReference}`,
          },
        });
      }
      return tx.payoutBatch.update({ where: { id }, data: { status: 'PAID' } });
    });
  }
}
