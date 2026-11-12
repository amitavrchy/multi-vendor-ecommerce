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
import { Actor, Principal, Public, Roles } from './auth/access';
import { Db } from './db';
import { VendorScope } from './vendor-scope.service';
import { input } from './common/input';
@Controller('business')
export class BusinessController {
  constructor(
    private db: Db,
    private scope: VendorScope,
  ) {}
  @Get('me') async me(@Actor() u: Principal) {
    return {
      profile: await this.db.businessProfile.findUnique({ where: { userId: u.id } }),
      quotes: await this.db.quoteRequest.findMany({
        where: { userId: u.id },
        include: {
          variant: {
            include: {
              product: {
                select: { title: true, slug: true, vendor: { select: { storeName: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  @Post('apply') async apply(@Actor() u: Principal, @Body() body: unknown) {
    const d = input(
      z.object({
        legalName: z.string().trim().min(3).max(120),
        registrationNumber: z.string().trim().min(4).max(80),
        billingAddress: z.string().trim().min(10).max(500),
      }),
      body,
    );
    return this.db.businessProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, ...d },
      update: { ...d, status: 'PENDING', reviewNote: null },
    });
  }
  @Roles('PLATFORM_ADMIN') @Get('admin/applications') applications() {
    return this.db.businessProfile.findMany({
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
  @Roles('PLATFORM_ADMIN') @Patch('admin/applications/:id') async review(
    @Param('id') userId: string,
    @Body() body: unknown,
  ) {
    const d = input(
      z.object({
        status: z.enum(['APPROVED', 'REJECTED']),
        reviewNote: z.string().trim().min(5).max(1000),
      }),
      body,
    );
    return this.db.atomic(async (tx) => {
      const result = await tx.businessProfile.update({ where: { userId }, data: d });
      const account = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      await tx.marketingSubscriber.updateMany({
        where: { email: account.email },
        data: { userId },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'ACCOUNT_NOTICE',
          payload: {
            userId,
            title: 'Business application updated',
            body: `Your business account is ${d.status.toLowerCase()}. ${d.reviewNote}`,
            path: '/business',
          },
        },
      });
      return result;
    });
  }
  @Public() @Get('tiers/:id') async tiers(@Param('id') variantId: string) {
    const v = await this.db.productVariant.findFirst({
      where: { id: variantId, product: { status: 'ACTIVE', vendor: { status: 'ACTIVE' } } },
      include: { wholesaleTiers: { orderBy: { minQty: 'asc' } } },
    });
    if (!v) throw new NotFoundException();
    return v.wholesaleTiers;
  }
  @Roles('VENDOR_OWNER') @Post('tiers/:id') async setTiers(
    @Actor() u: Principal,
    @Param('id') variantId: string,
    @Body() body: unknown,
  ) {
    const d = input(
      z.object({
        tiers: z
          .array(
            z.object({
              minQty: z.number().int().min(2).max(999),
              unitPriceMinor: z.number().int().min(1).max(100000000),
            }),
          )
          .max(5),
      }),
      body,
    );
    const vendor = await this.scope.get(u, true);
    return this.db.atomic(async (tx) => {
      const v = await tx.productVariant.findFirst({
        where: { id: variantId, product: { vendorId: vendor.id } },
      });
      if (!v) throw new NotFoundException();
      const tiers = [...d.tiers].sort((a, b) => a.minQty - b.minQty);
      if (
        tiers.some(
          (t, i) =>
            t.unitPriceMinor > v.priceMinor ||
            (i > 0 &&
              (t.minQty === tiers[i - 1].minQty ||
                t.unitPriceMinor >= tiers[i - 1].unitPriceMinor)),
        )
      )
        throw new BadRequestException(
          'Larger quantities must have distinct thresholds and lower prices, at or below retail',
        );
      await tx.wholesaleTier.deleteMany({ where: { variantId } });
      await tx.wholesaleTier.createMany({ data: tiers.map((t) => ({ ...t, variantId })) });
      return tiers;
    });
  }
  @Post('quotes') async request(@Actor() u: Principal, @Body() body: unknown) {
    const d = input(
      z.object({
        variantId: z.string().max(100),
        qty: z.number().int().min(2).max(999),
        note: z.string().trim().min(10).max(1000),
      }),
      body,
    );
    const profile = await this.db.businessProfile.findUnique({ where: { userId: u.id } });
    if (profile?.status !== 'APPROVED')
      throw new BadRequestException('Business verification is required');
    const v = await this.db.productVariant.findFirst({
      where: { id: d.variantId, product: { status: 'ACTIVE', vendor: { status: 'ACTIVE' } } },
    });
    if (!v) throw new NotFoundException();
    return this.db.quoteRequest.create({ data: { ...d, userId: u.id } });
  }
  @Roles('VENDOR_OWNER') @Get('seller/quotes') async sellerQuotes(@Actor() u: Principal) {
    const v = await this.scope.get(u, true);
    return this.db.quoteRequest.findMany({
      where: { variant: { product: { vendorId: v.id } } },
      include: {
        user: { select: { name: true, business: true } },
        variant: { include: { product: { select: { title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Roles('VENDOR_OWNER') @Post('seller/quotes/:id/offer') async offer(
    @Actor() u: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const d = input(
        z.object({
          unitPriceMinor: z.number().int().positive().max(100000000),
          expiresDays: z.number().int().min(1).max(14),
          sellerNote: z.string().trim().min(5).max(1000),
        }),
        body,
      ),
      v = await this.scope.get(u, true);
    return this.db.atomic(async (tx) => {
      const q = await tx.quoteRequest.findFirst({
        where: {
          id,
          status: { in: ['REQUESTED', 'OFFERED'] },
          variant: { product: { vendorId: v.id } },
        },
        include: { variant: true },
      });
      if (!q) throw new NotFoundException();
      if (d.unitPriceMinor > q.variant.priceMinor)
        throw new BadRequestException('Offer must not exceed the current retail price');
      const result = await tx.quoteRequest.update({
        where: { id },
        data: {
          unitPriceMinor: d.unitPriceMinor,
          sellerNote: d.sellerNote,
          expiresAt: new Date(Date.now() + d.expiresDays * 86400000),
          status: 'OFFERED',
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'ACCOUNT_NOTICE',
          payload: {
            userId: q.userId,
            title: 'Your business quote is ready',
            body: d.sellerNote,
            path: '/business',
          },
        },
      });
      return result;
    });
  }
  @Post('quotes/:id/decision') async decide(
    @Actor() u: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const d = input(z.object({ accept: z.boolean() }), body);
    const result = await this.db.quoteRequest.updateMany({
      where: {
        id,
        userId: u.id,
        status: d.accept ? 'OFFERED' : { in: ['REQUESTED', 'OFFERED', 'ACCEPTED'] },
        ...(d.accept ? { expiresAt: { gt: new Date() } } : {}),
      },
      data: { status: d.accept ? 'ACCEPTED' : 'DECLINED' },
    });
    if (!result.count) throw new BadRequestException('Quote is unavailable or expired');
    return { ok: true };
  }
}
