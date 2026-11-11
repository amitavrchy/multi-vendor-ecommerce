import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal, Roles } from './auth/access';
import { input } from './common/input';
import { OrdersService } from './orders.service';
import { CheckoutService } from './checkout.service';
import { VendorScope } from './vendor-scope.service';
@Controller()
export class OrdersController {
  constructor(
    private db: Db,
    private orders: OrdersService,
    private checkout: CheckoutService,
    private scope: VendorScope,
  ) {}
  @Get('orders') list(@Actor() u: Principal) {
    return this.db.order.findMany({
      where: { userId: u.id },
      include: {
        payment: { select: { provider: true, status: true, raw: true } },
        vendorOrders: {
          include: {
            vendor: { select: { storeName: true } },
            lines: { include: { variant: { select: { productId: true } } } },
            returns: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post('orders/:id/cancel-payment') async cancel(@Actor() u: Principal, @Param('id') id: string) {
    const o = await this.db.order.findFirst({ where: { id, userId: u.id } });
    if (!o) throw new NotFoundException();
    await this.checkout.cancelPending(id);
    return { ok: true };
  }
  @Roles('VENDOR_OWNER', 'VENDOR_STAFF') @Get('vendor/orders') async vendorOrders(
    @Actor() u: Principal,
  ) {
    const v = await this.scope.get(u);
    return this.db.vendorOrder.findMany({
      where: { vendorId: v.id },
      include: {
        order: { select: { shippingAddress: true, createdAt: true } },
        lines: true,
        returns: true,
      },
      orderBy: { order: { createdAt: 'desc' } },
      take: 100,
    });
  }
  @Roles('VENDOR_OWNER', 'VENDOR_STAFF', 'PLATFORM_ADMIN')
  @Post('vendor/orders/:id/status')
  transition(@Actor() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const d = input(
      z.object({
        status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']),
        trackingNumber: z.string().max(120).optional(),
      }),
      body,
    );
    return this.orders.transition(u, id, d.status, d.trackingNumber);
  }
  @Roles('VENDOR_OWNER', 'VENDOR_STAFF') @Post('vendor/orders/:id/ship') ship(
    @Actor() u: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const d = input(z.object({ trackingNumber: z.string().min(3).max(120) }), body);
    return this.orders.transition(u, id, 'SHIPPED', d.trackingNumber);
  }
}
