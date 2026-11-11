import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal } from './auth/access';
import { input } from './common/input';
@Controller('reviews')
export class ReviewsController {
  constructor(private db: Db) {}
  @Post() async write(@Actor() u: Principal, @Body() b: unknown) {
    const d = input(
      z.object({
        productId: z.string(),
        orderId: z.string(),
        rating: z.number().int().min(1).max(5),
        body: z.string().trim().min(10).max(2000),
      }),
      b,
    );
    const line = await this.db.orderLine.findFirst({
      where: {
        variant: { productId: d.productId },
        vendorOrder: { status: 'DELIVERED', order: { id: d.orderId, userId: u.id } },
      },
    });
    if (!line) throw new BadRequestException('Only verified delivered purchases can be reviewed');
    const old = await this.db.review.findUnique({
      where: { productId_userId: { productId: d.productId, userId: u.id } },
    });
    if (old && Date.now() - old.createdAt.getTime() > 7 * 86400000)
      throw new BadRequestException('The seven-day edit window has closed');
    return this.db.review.upsert({
      where: { productId_userId: { productId: d.productId, userId: u.id } },
      create: { ...d, userId: u.id },
      update: { rating: d.rating, body: d.body },
    });
  }
}
