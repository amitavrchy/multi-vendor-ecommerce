import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { Public } from './auth/access';
import { input } from './common/input';
import { PostgresSearch } from './search';
export const productInclude = {
  vendor: { select: { id: true, storeName: true, slug: true } },
  category: true,
  variants: true,
  reviews: { select: { rating: true } },
} satisfies Prisma.ProductInclude;
@Public()
@Controller()
export class CatalogController {
  constructor(private db: Db) {}
  @Get('categories') categories() {
    return this.db.category.findMany({
      include: {
        _count: {
          select: { products: { where: { status: 'ACTIVE', vendor: { status: 'ACTIVE' } } } },
        },
      },
    });
  }
  @Get('search') search(@Query() query: unknown) {
    return this.products(query);
  }
  @Get('products') async products(@Query() query: unknown) {
    const q = input(
      z.object({
        q: z.string().max(100).optional(),
        category: z.string().optional(),
        vendor: z.string().optional(),
        sort: z
          .enum(['featured', 'newest', 'price-asc', 'price-desc', 'rating'])
          .default('featured'),
        page: z.coerce.number().int().min(1).max(1000).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(12),
        min: z.coerce.number().min(0).optional(),
        max: z.coerce.number().min(0).optional(),
        inStock: z.enum(['true', 'false']).optional(),
      }),
      query,
    );
    const result = await new PostgresSearch(this.db).find(q);
    const rows = await this.db.product.findMany({
      where: { id: { in: result.ids } },
      include: productInclude,
    });
    const items = result.ids.map((id) => rows.find((p) => p.id === id)!);
    return { items, total: result.total, page: q.page, pages: Math.ceil(result.total / q.limit) };
  }
  @Get('products/:slug') async detail(@Param('slug') slug: string) {
    const p = await this.db.product.findFirst({
      where: { slug, status: 'ACTIVE', vendor: { status: 'ACTIVE' } },
      include: {
        ...productInclude,
        reviews: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }
  @Get('vendors') vendors() {
    return this.db.vendor.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        slug: true,
        storeName: true,
        description: true,
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
    });
  }
  @Get('vendors/:slug') async vendor(@Param('slug') slug: string) {
    const v = await this.db.vendor.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true, slug: true, storeName: true, description: true, createdAt: true },
    });
    if (!v) throw new NotFoundException();
    return v;
  }
}
