import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Actor, Principal } from './auth/access';
import { input } from './common/input';
import { Db } from './db';

export async function reconcileRewards(tx: Prisma.TransactionClient, orderId: string, ref: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payment: true,
      vendorOrders: { include: { returns: { include: { refund: true } } } },
    },
  });
  if (
    order.payment?.status !== 'SUCCEEDED' ||
    order.vendorOrders.some((v) => !['DELIVERED', 'CANCELLED'].includes(v.status))
  )
    return;
  const base = order.vendorOrders
    .filter((v) => v.status === 'DELIVERED')
    .reduce(
      (sum, v) =>
        sum +
        Math.max(
          0,
          v.goodsMinor -
            v.discountMinor -
            v.returns.reduce(
              (s, r) =>
                s +
                (r.refund?.status === 'SUCCEEDED'
                  ? r.refund.amountMinor + r.restockingFeeMinor
                  : 0),
              0,
            ),
        ),
      0,
    );
  const total = await tx.rewardEntry.aggregate({
      where: { orderId, type: { in: ['ORDER_EARN', 'RETURN_ADJUST'] } },
      _sum: { points: true },
    }),
    already = total._sum.points || 0,
    target = Math.floor(base / 10000);
  if (target !== already)
    await tx.rewardEntry.create({
      data: {
        userId: order.userId,
        orderId,
        points: target - already,
        type: already ? 'RETURN_ADJUST' : 'ORDER_EARN',
        ref: `loyalty:${ref}`,
      },
    });
  const referral = await tx.referral.findUnique({ where: { inviteeId: order.userId } });
  if (referral?.status === 'CLAIMED' && order.createdAt >= referral.createdAt && base >= 100000) {
    await tx.referral.update({
      where: { id: referral.id },
      data: { status: 'QUALIFIED', orderId },
    });
    await tx.rewardEntry.createMany({
      data: [referral.referrerId, referral.inviteeId].map((userId) => ({
        userId,
        orderId,
        points: 100,
        type: 'REFERRAL',
        ref: `referral:${referral.id}:${userId}`,
      })),
    });
  } else if (referral?.status === 'QUALIFIED' && referral.orderId === orderId && base < 100000) {
    await tx.referral.update({ where: { id: referral.id }, data: { status: 'REVERSED' } });
    await tx.rewardEntry.createMany({
      data: [referral.referrerId, referral.inviteeId].map((userId) => ({
        userId,
        orderId,
        points: -100,
        type: 'REFERRAL_REVERSAL',
        ref: `referral-reversal:${referral.id}:${userId}`,
      })),
    });
  }
}
@Controller('rewards')
export class RewardsController {
  constructor(private db: Db) {}
  @Get() async summary(@Actor() u: Principal) {
    const profile = await this.db.referralProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, code: randomBytes(6).toString('hex').toUpperCase() },
      update: {},
    });
    const [sum, entries, coupons, referrals, claimed] = await Promise.all([
      this.db.rewardEntry.aggregate({ where: { userId: u.id }, _sum: { points: true } }),
      this.db.rewardEntry.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.db.coupon.findMany({
        where: {
          ownerId: u.id,
          singleUse: true,
          active: true,
          expiresAt: { gt: new Date() },
          claimedOrderId: null,
        },
        select: { code: true, maxDiscountMinor: true, expiresAt: true },
      }),
      this.db.referral.groupBy({
        by: ['status'],
        where: { referrerId: u.id },
        _count: { _all: true },
      }),
      this.db.referral.findUnique({ where: { inviteeId: u.id }, select: { status: true } }),
    ]);
    return {
      points: sum._sum.points || 0,
      entries,
      coupons,
      referralCode: profile.code,
      referrals,
      claimed,
    };
  }
  @Post('redeem') async redeem(@Actor() u: Principal) {
    return this.db.atomic(async (tx) => {
      const balance = await tx.rewardEntry.aggregate({
        where: { userId: u.id },
        _sum: { points: true },
      });
      if ((balance._sum.points || 0) < 100)
        throw new BadRequestException('100 points are required to redeem a voucher');
      const code = `REWARD${randomBytes(8).toString('hex').toUpperCase()}`;
      const coupon = await tx.coupon.create({
        data: {
          code,
          ownerId: u.id,
          singleUse: true,
          percent: 100,
          maxDiscountMinor: 10000,
          minGoodsMinor: 10000,
          expiresAt: new Date(Date.now() + 90 * 86400000),
          funding: 'PLATFORM',
        },
      });
      await tx.rewardEntry.create({
        data: { userId: u.id, points: -100, type: 'REDEEM', ref: `redeem:${code}` },
      });
      return { code: coupon.code, expiresAt: coupon.expiresAt };
    });
  }
  @Post('referral') async claim(@Actor() u: Principal, @Body() body: unknown) {
    const { code } = input(
      z.object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-F0-9]{12}$/),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      if (await tx.order.count({ where: { userId: u.id } }))
        throw new BadRequestException('Referral codes must be claimed before your first order');
      const profile = await tx.referralProfile.findUnique({ where: { code } });
      if (!profile || profile.userId === u.id)
        throw new BadRequestException('Use a valid code from another shopper');
      if (await tx.referral.findUnique({ where: { inviteeId: u.id } }))
        throw new BadRequestException('A referral has already been claimed');
      return tx.referral.create({ data: { referrerId: profile.userId, inviteeId: u.id } });
    });
  }
}
