import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, Principal, Roles } from './auth/access';
import { Db } from './db';
import { VendorScope } from './vendor-scope.service';
import { input } from './common/input';
@Roles('VENDOR_OWNER')
@Controller('vendor/analytics')
export class AnalyticsController {
  constructor(
    private db: Db,
    private scope: VendorScope,
  ) {}
  @Get() async report(@Actor() u: Principal, @Query('days') raw: unknown) {
    const days = input(
      z.coerce.number().pipe(z.union([z.literal(14), z.literal(30), z.literal(90)])),
      raw || 30,
    );
    const vendor = await this.scope.get(u, true);
    const now = Date.now();
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const firstDay = date.format(new Date(now - (days - 1) * 86400000));
    const since = new Date(`${firstDay}T00:00:00+06:00`);
    const [orders, products, followers, earned] = await Promise.all([
      this.db.vendorOrder.findMany({
        where: { vendorId: vendor.id, order: { createdAt: { gte: since } } },
        include: { order: { select: { createdAt: true } }, lines: true },
      }),
      this.db.productVariant.findMany({
        where: { product: { vendorId: vendor.id, status: 'ACTIVE' } },
        select: {
          id: true,
          sku: true,
          stockQty: true,
          reservedQty: true,
          product: { select: { title: true } },
        },
      }),
      this.db.storeFollow.count({ where: { vendorId: vendor.id } }),
      this.db.vendorLedgerEntry.aggregate({
        where: {
          vendorId: vendor.id,
          type: { in: ['SALE', 'REFUND_CLAWBACK'] },
          createdAt: { gte: since },
        },
        _sum: { amountMinor: true },
      }),
    ]);
    const paid = orders.filter((o) => !['PENDING_PAYMENT', 'CANCELLED'].includes(o.status));
    const daily = new Map<string, { orders: number; salesMinor: number }>();
    for (const order of paid) {
      const key = date.format(order.order.createdAt);
      const row = daily.get(key) || { orders: 0, salesMinor: 0 };
      row.orders++;
      row.salesMinor += order.goodsMinor - order.discountMinor;
      daily.set(key, row);
    }
    const series = Array.from({ length: days }, (_, i) => {
      const day = date.format(new Date(now - (days - 1 - i) * 86400000));
      const row = daily.get(day) || { orders: 0, salesMinor: 0 };
      return {
        day,
        ...row,
      };
    });
    const top = new Map<
      string,
      { variantId: string; title: string; units: number; salesMinor: number }
    >();
    for (const o of paid)
      for (const l of o.lines) {
        const row = top.get(l.variantId) || {
          variantId: l.variantId,
          title: l.titleSnapshot,
          units: 0,
          salesMinor: 0,
        };
        row.units += l.qty;
        row.salesMinor += l.qty * l.unitPriceMinor;
        top.set(l.variantId, row);
      }
    return {
      days,
      series,
      summary: {
        orders: paid.length,
        salesMinor: paid.reduce((s, o) => s + o.goodsMinor - o.discountMinor, 0),
        delivered: paid.filter((o) => o.status === 'DELIVERED').length,
        cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        netEarnedMinor: earned._sum.amountMinor || 0,
        followers,
      },
      lowStock: products.filter((p) => p.stockQty - p.reservedQty <= 5).slice(0, 20),
      topProducts: [...top.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    };
  }
}
