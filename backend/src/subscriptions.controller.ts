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
import { Actor, Principal } from './auth/access';
import { input } from './common/input';
import { Db } from './db';
export async function prepareRenewals(db: Db) {
  const due = await db.subscription.findMany({
    where: { status: 'ACTIVE', nextAt: { lte: new Date() }, renewals: { none: { status: 'DUE' } } },
    orderBy: { nextAt: 'asc' },
    take: 50,
    select: { id: true },
  });
  for (const { id } of due)
    await db.atomic(async (tx) => {
      const s = await tx.subscription.findUnique({
        where: { id },
        include: {
          renewals: { where: { status: 'DUE' } },
          variant: { include: { product: true } },
        },
      });
      if (!s || s.status !== 'ACTIVE' || s.nextAt > new Date() || s.renewals.length) return;
      const cycle = s.cycle + 1,
        renewal = await tx.subscriptionRenewal.create({
          data: { subscriptionId: id, cycle, dueAt: s.nextAt },
        });
      await tx.subscription.update({
        where: { id },
        data: { cycle, nextAt: new Date(Date.now() + s.intervalDays * 86400000) },
      });
      await tx.outboxEvent.create({
        data: {
          id: `renewal:${renewal.id}`,
          type: 'ACCOUNT_NOTICE',
          payload: {
            userId: s.userId,
            title: 'Your replenishment is ready to review',
            body: `Review current pricing and availability for ${s.variant.product.title}. Payment requires your approval.`,
            path: '/subscriptions',
          },
        },
      });
    });
}
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private db: Db) {}
  @Get() list(@Actor() u: Principal) {
    return this.db.subscription.findMany({
      where: { userId: u.id },
      include: {
        variant: { include: { product: { select: { title: true, image: true, slug: true } } } },
        renewals: { orderBy: { cycle: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post() async create(@Actor() u: Principal, @Body() body: unknown) {
    const d = input(
      z.object({
        variantId: z.string().max(100),
        qty: z.number().int().min(1).max(99),
        intervalDays: z.union([z.literal(14), z.literal(30), z.literal(60), z.literal(90)]),
        startNow: z.boolean().default(false),
      }),
      body,
    );
    if (
      !(await this.db.productVariant.findFirst({
        where: { id: d.variantId, product: { status: 'ACTIVE', vendor: { status: 'ACTIVE' } } },
      }))
    )
      throw new NotFoundException();
    if (
      (await this.db.subscription.count({
        where: { userId: u.id, status: { not: 'CANCELLED' } },
      })) >= 20
    )
      throw new BadRequestException('Manage existing subscriptions before adding more');
    return this.db.subscription.create({
      data: {
        userId: u.id,
        variantId: d.variantId,
        qty: d.qty,
        intervalDays: d.intervalDays,
        nextAt: new Date(Date.now() + (d.startNow ? 0 : d.intervalDays * 86400000)),
      },
    });
  }
  @Patch(':id') async change(
    @Actor() u: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const d = input(z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) }), body);
    return this.db.atomic(async (tx) => {
      const s = await tx.subscription.findFirst({
        where: { id, userId: u.id, status: { not: 'CANCELLED' } },
      });
      if (!s) throw new NotFoundException();
      const changed = await tx.subscription.update({
        where: { id },
        data: {
          status: d.status,
          ...(d.status === 'ACTIVE'
            ? { nextAt: new Date(Date.now() + s.intervalDays * 86400000) }
            : {}),
        },
      });
      if (d.status === 'CANCELLED')
        await tx.subscriptionRenewal.updateMany({
          where: { subscriptionId: id, status: 'DUE' },
          data: { status: 'SKIPPED' },
        });
      return changed;
    });
  }
  @Post('renewals/:id/skip') async skip(@Actor() u: Principal, @Param('id') id: string) {
    const result = await this.db.subscriptionRenewal.updateMany({
      where: { id, status: 'DUE', subscription: { userId: u.id } },
      data: { status: 'SKIPPED' },
    });
    if (!result.count) throw new NotFoundException();
    return { ok: true };
  }
}
