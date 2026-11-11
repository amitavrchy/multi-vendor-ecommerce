import { Controller, Get, NotFoundException, Param, Query, Optional, Header } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { Public } from './auth/access';
import { input } from './common/input';
import { PostgresSearch } from './search';
import { CacheService } from './cache.service';
export const productInclude = {
  vendor: { select: { id: true, storeName: true, slug: true } },
  category: true,
  variants: true,
  reviews: { select: { rating: true } },
} satisfies Prisma.ProductInclude;
@Public()
@Controller()
export class CatalogController {
  constructor(
    private db: Db,
    @Optional() private cache?: CacheService,
  ) {}
  @Get('categories') categories() {
    const load = () =>
      this.db.category.findMany({
        include: {
          _count: {
            select: { products: { where: { status: 'ACTIVE', vendor: { status: 'ACTIVE' } } } },
          },
        },
      });
    return this.cache ? this.cache.remember('categories', 300, load) : load();
  }
  @Get('search') search(@Query() query: unknown) {
    return this.products(query);
  }
  @Get('wishlist') wishlist(@Query('ids') ids: string) {
    const list = input(
      z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(200),
      (ids || '').split(',').filter(Boolean),
    );
    return this.db.product.findMany({
      where: { id: { in: list }, status: 'ACTIVE', vendor: { status: 'ACTIVE' } },
      include: productInclude,
    });
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
  @Header('Surrogate-Key', 'catalog')
  @Get('products/:slug')
  async detail(@Param('slug') slug: string) {
    const active = await this.db.product.findFirst({
      where: { slug, status: 'ACTIVE', vendor: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!active) throw new NotFoundException('Product not found');
    const load = () =>
      this.db.product.findFirst({
        where: { slug, status: 'ACTIVE', vendor: { status: 'ACTIVE' } },
        include: {
          ...productInclude,
          reviews: {
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    const p = this.cache ? await this.cache.remember(`product:${slug}`, 60, load) : await load();
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
