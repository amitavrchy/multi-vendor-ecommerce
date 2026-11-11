import { Prisma } from '@prisma/client';
import { Db } from './db';
export type SearchInput = {
  q?: string;
  category?: string;
  vendor?: string;
  sort: string;
  page: number;
  limit: number;
  min?: number;
  max?: number;
  inStock?: string;
};
export interface SearchDriver {
  find(query: SearchInput): Promise<{ ids: string[]; total: number }>;
}
export class PostgresSearch implements SearchDriver {
  constructor(private db: Db) {}
  async find(q: SearchInput) {
    const clauses = [Prisma.sql`p.status='ACTIVE'`, Prisma.sql`v.status='ACTIVE'`];
    if (q.category) clauses.push(Prisma.sql`p."categoryId"=${q.category}`);
    if (q.vendor) clauses.push(Prisma.sql`v.slug=${q.vendor}`);
    if (q.q?.trim())
      clauses.push(
        Prisma.sql`(to_tsvector('simple',p.title || ' ' || p.description) @@ plainto_tsquery('simple',${q.q}) OR p.title ILIKE ${'%' + q.q + '%'} OR v."storeName" ILIKE ${'%' + q.q + '%'})`,
      );
    const variants = [Prisma.sql`pv."productId"=p.id`];
    if (q.min !== undefined) variants.push(Prisma.sql`pv."priceMinor">=${Math.round(q.min * 100)}`);
    if (q.max !== undefined) variants.push(Prisma.sql`pv."priceMinor"<=${Math.round(q.max * 100)}`);
    if (q.inStock === 'true') variants.push(Prisma.sql`pv."stockQty">pv."reservedQty"`);
    clauses.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" pv WHERE ${Prisma.join(variants, ' AND ')})`,
    );
    const where = Prisma.sql`FROM "Product" p JOIN "Vendor" v ON v.id=p."vendorId" WHERE ${Prisma.join(clauses, ' AND ')}`;
    const sort =
      q.sort === 'price-asc'
        ? Prisma.sql`(SELECT MIN("priceMinor") FROM "ProductVariant" WHERE "productId"=p.id) ASC`
        : q.sort === 'price-desc'
          ? Prisma.sql`(SELECT MIN("priceMinor") FROM "ProductVariant" WHERE "productId"=p.id) DESC`
          : q.sort === 'rating'
            ? Prisma.sql`COALESCE((SELECT AVG(rating) FROM "Review" WHERE "productId"=p.id),0) DESC`
            : q.sort === 'newest'
              ? Prisma.sql`p."createdAt" DESC`
              : Prisma.sql`p.featured DESC,p."createdAt" DESC`;
    const [rows, count] = await Promise.all([
      this.db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT p.id ${where} ORDER BY ${sort},p.id ASC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      ),
      this.db.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS total ${where}`),
    ]);
    return { ids: rows.map((r) => r.id), total: count[0].total };
  }
}
