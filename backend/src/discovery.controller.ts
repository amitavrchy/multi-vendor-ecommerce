import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Actor, Principal, Public } from './auth/access';
import { input } from './common/input';
import { Db } from './db';
import { productInclude } from './catalog.controller';

const visible = {
  status: 'ACTIVE',
  vendor: { status: 'ACTIVE' },
} satisfies Prisma.ProductWhereInput;
@Controller('discovery')
export class DiscoveryController {
  constructor(private db: Db) {}
  @Get('saved') async saved(@Actor() u: Principal) {
    const rows = await this.db.savedProduct.findMany({
      where: { userId: u.id, product: visible },
      include: { product: { include: productInclude } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => row.product);
  }
  @Post('saved') async save(@Actor() u: Principal, @Body() body: unknown) {
    const { productId } = input(z.object({ productId: z.string().min(1).max(100) }), body);
    if (!(await this.db.product.findFirst({ where: { id: productId, ...visible } })))
      throw new NotFoundException('Product is unavailable');
    return this.db.savedProduct.upsert({
      where: { userId_productId: { userId: u.id, productId } },
      create: { userId: u.id, productId },
      update: {},
    });
  }
  @Post('saved/merge') async merge(@Actor() u: Principal, @Body() body: unknown) {
    const { ids } = input(z.object({ ids: z.array(z.string().min(1).max(100)).max(200) }), body);
    const products = await this.db.product.findMany({
      where: { ...visible, id: { in: ids } },
      select: { id: true },
    });
    await this.db.savedProduct.createMany({
      data: products.map((p) => ({ userId: u.id, productId: p.id })),
      skipDuplicates: true,
    });
    return this.saved(u);
  }
  @Delete('saved/:id') async unsave(@Actor() u: Principal, @Param('id') productId: string) {
    await this.db.savedProduct.deleteMany({ where: { userId: u.id, productId } });
    return { ok: true };
  }
  @Get('alerts') alerts(@Actor() u: Principal) {
    return this.db.productAlert.findMany({
      where: { userId: u.id },
      include: {
        variant: { include: { product: { select: { title: true, slug: true, image: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
  @Post('alerts') async alert(@Actor() u: Principal, @Body() body: unknown) {
    const d = input(
      z.object({
        variantId: z.string().min(1).max(100),
        kind: z.enum(['PRICE', 'STOCK']),
        targetMinor: z.number().int().positive().max(100000000).optional(),
      }),
      body,
    );
    const v = await this.db.productVariant.findFirst({
      where: { id: d.variantId, product: visible },
    });
    if (!v) throw new NotFoundException('Product is unavailable');
    if (d.kind === 'PRICE' && (!d.targetMinor || d.targetMinor >= v.priceMinor))
      throw new BadRequestException('Choose a target below the current price');
    if (d.kind === 'STOCK' && v.stockQty > v.reservedQty)
      throw new BadRequestException('This variant is already in stock');
    return this.db.productAlert.upsert({
      where: { userId_variantId_kind: { userId: u.id, variantId: v.id, kind: d.kind } },
      create: {
        userId: u.id,
        variantId: v.id,
        kind: d.kind,
        targetMinor: d.kind === 'PRICE' ? d.targetMinor : null,
      },
      update: {
        active: true,
        triggeredAt: null,
        lastCheckedAt: new Date(),
        generation: { increment: 1 },
        targetMinor: d.kind === 'PRICE' ? d.targetMinor : null,
      },
    });
  }
  @Delete('alerts/:id') async cancelAlert(@Actor() u: Principal, @Param('id') id: string) {
    const result = await this.db.productAlert.deleteMany({ where: { userId: u.id, id } });
    if (!result.count) throw new NotFoundException();
    return { ok: true };
  }
  @Get('following') async following(@Actor() u: Principal) {
    return this.db.storeFollow.findMany({
      where: { userId: u.id, vendor: { status: 'ACTIVE' } },
      include: { vendor: { select: { id: true, slug: true, storeName: true, description: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Post('following/:id') async follow(@Actor() u: Principal, @Param('id') vendorId: string) {
    if (!(await this.db.vendor.findFirst({ where: { id: vendorId, status: 'ACTIVE' } })))
      throw new NotFoundException();
    return this.db.storeFollow.upsert({
      where: { userId_vendorId: { userId: u.id, vendorId } },
      create: { userId: u.id, vendorId },
      update: {},
    });
  }
  @Delete('following/:id') async unfollow(@Actor() u: Principal, @Param('id') vendorId: string) {
    await this.db.storeFollow.deleteMany({ where: { userId: u.id, vendorId } });
    return { ok: true };
  }
  @Public() @Get('suggestions') async suggestions(@Query('q') raw: unknown) {
    const q = input(z.string().trim().max(100), raw || '');
    if (q.length < 2) return { products: [], categories: [] };
    const [products, categories] = await Promise.all([
      this.db.product.findMany({
        where: { ...visible, title: { contains: q, mode: 'insensitive' } },
        select: { id: true, title: true, slug: true, image: true },
        orderBy: [{ featured: 'desc' }, { title: 'asc' }],
        take: 5,
      }),
      this.db.category.findMany({
        where: { name: { contains: q, mode: 'insensitive' }, products: { some: visible } },
        select: { id: true, name: true },
        take: 3,
      }),
    ]);
    return { products, categories };
  }
  @Public() @Get('prices/:id') async prices(@Param('id') variantId: string) {
    const v = await this.db.productVariant.findFirst({
      where: { id: variantId, product: visible },
    });
    if (!v) throw new NotFoundException();
    const points = await this.db.pricePoint.findMany({
      where: { variantId, recordedAt: { gte: new Date(Date.now() - 90 * 86400000) } },
      orderBy: { recordedAt: 'desc' },
      take: 90,
    });
    return { currentMinor: v.priceMinor, points: points.reverse() };
  }
  @Get('for-you') async recommendations(@Actor() u: Principal) {
    const saved = await this.db.savedProduct.findMany({
      where: { userId: u.id, product: visible },
      include: { product: { select: { categoryId: true } } },
      take: 200,
    });
    const followed = await this.db.storeFollow.findMany({
      where: { userId: u.id },
      select: { vendorId: true },
      take: 100,
    });
    const preferred = [...new Set(saved.map((s) => s.product.categoryId))];
    const ids = saved.map((s) => s.productId);
    const filter: Prisma.ProductWhereInput = { ...visible, id: { notIn: ids } };
    const items = await this.db.product.findMany({
      where: {
        ...filter,
        OR: [
          { categoryId: { in: preferred } },
          { vendorId: { in: followed.map((f) => f.vendorId) } },
        ],
      },
      include: productInclude,
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 8,
    });
    if (items.length < 8)
      items.push(
        ...(await this.db.product.findMany({
          where: { ...filter, id: { notIn: [...ids, ...items.map((p) => p.id)] } },
          include: productInclude,
          orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
          take: 8 - items.length,
        })),
      );
    return {
      items,
      reason:
        preferred.length || followed.length
          ? 'Inspired by your saved finds and followed stores'
          : 'Discover a few favourites to make this edit yours',
    };
  }
}
