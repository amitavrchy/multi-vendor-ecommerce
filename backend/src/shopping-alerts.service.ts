import { Injectable } from '@nestjs/common';
import { Db } from './db';
@Injectable()
export class ShoppingAlertsService {
  constructor(private db: Db) {}
  async check() {
    const due = await this.db.productAlert.findMany({
      where: { active: true },
      orderBy: [{ lastCheckedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true },
    });
    for (const { id } of due)
      await this.db.atomic(async (tx) => {
        const a = await tx.productAlert.findUnique({
          where: { id },
          include: { variant: { include: { product: { include: { vendor: true } } } } },
        });
        if (!a?.active) return;
        const v = a.variant,
          p = v.product;
        const eligible = p.status === 'ACTIVE' && p.vendor.status === 'ACTIVE';
        const triggered =
          eligible &&
          (a.kind === 'PRICE'
            ? a.targetMinor !== null && v.priceMinor <= a.targetMinor
            : v.stockQty > v.reservedQty);
        await tx.productAlert.update({
          where: { id },
          data: {
            lastCheckedAt: new Date(),
            ...(triggered ? { active: false, triggeredAt: new Date() } : {}),
          },
        });
        if (triggered)
          await tx.outboxEvent.create({
            data: {
              id: `shopping-alert:${id}:${a.generation}`,
              type: 'SHOPPING_ALERT',
              payload: {
                userId: a.userId,
                title:
                  a.kind === 'PRICE'
                    ? 'Your price target was reached'
                    : 'Your saved find is back in stock',
                body: `${p.title} is available for ৳${(v.priceMinor / 100).toFixed(2)}.`,
                path: `/product/${p.slug}`,
              },
            },
          });
      });
  }
}
