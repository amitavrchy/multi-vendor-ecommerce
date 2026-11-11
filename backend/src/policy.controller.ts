import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Public, Roles } from './auth/access';
import { input } from './common/input';
@Controller()
export class PolicyController {
  constructor(private db: Db) {}
  @Roles('PLATFORM_ADMIN') @Get('admin/deliveries') deliveries() {
    return this.db.deliveryReceipt.findMany({ orderBy: { id: 'desc' }, take: 100 });
  }
  @Public() @Get('policies') async publicPolicy() {
    return (
      (await this.db.platformPolicy.findUnique({ where: { id: 'marketplace' } })) || {
        returnWindowDays: 14,
        restockingBps: 0,
        reviewDelayDays: 3,
        weeklyPayouts: false,
        payoutWeekday: 1,
      }
    );
  }
  @Roles('PLATFORM_ADMIN') @Patch('admin/policies') async update(@Body() b: unknown) {
    const d = input(
      z.object({
        returnWindowDays: z.number().int().min(1).max(90),
        restockingBps: z.number().int().min(0).max(5000),
        weeklyPayouts: z.boolean(),
        payoutWeekday: z.number().int().min(0).max(6),
        reviewDelayDays: z.number().int().min(1).max(30),
      }),
      b,
    );
    return this.db.platformPolicy.upsert({ where: { id: 'marketplace' }, create: d, update: d });
  }
  @Roles('PLATFORM_ADMIN') @Get('admin/categories') categories() {
    return this.db.category.findMany();
  }
  @Roles('PLATFORM_ADMIN') @Patch('admin/categories/:id') category(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const d = input(z.object({ commissionBps: z.number().int().min(0).max(10000).nullable() }), b);
    return this.db.category.update({ where: { id }, data: d });
  }
  @Roles('PLATFORM_ADMIN') @Get('admin/coupons') coupons() {
    return this.db.coupon.findMany({ orderBy: { expiresAt: 'desc' } });
  }
  @Roles('PLATFORM_ADMIN') @Post('admin/coupons') coupon(@Body() b: unknown) {
    const d = input(
      z.object({
        code: z.string().regex(/^[A-Z0-9_-]{3,40}$/),
        percent: z.number().int().min(1).max(100),
        maxDiscountMinor: z.number().int().min(0),
        minGoodsMinor: z.number().int().min(0),
        funding: z.enum(['PLATFORM', 'VENDOR']),
        expiresAt: z.coerce.date(),
        active: z.boolean(),
      }),
      b,
    );
    return this.db.coupon.upsert({ where: { code: d.code }, create: d, update: d });
  }
  @Roles('PLATFORM_ADMIN') @Post('admin/events/:id/retry') retry(@Param('id') id: string) {
    return this.db.outboxEvent.update({
      where: { id },
      data: { attempts: 0, lastError: null, processedAt: null },
    });
  }
}
