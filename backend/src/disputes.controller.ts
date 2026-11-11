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
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal, Roles } from './auth/access';
import { input } from './common/input';
@Controller('disputes')
export class DisputesController {
  constructor(private db: Db) {}
  private async scope(u: Principal): Promise<Prisma.DisputeWhereInput> {
    if (['PLATFORM_ADMIN', 'SUPPORT_AGENT'].includes(u.role)) return {};
    const orders = await this.db.vendorOrder.findMany({
      where: { vendor: { OR: [{ ownerId: u.id }, { members: { some: { userId: u.id } } }] } },
      select: { id: true },
    });
    return { OR: [{ userId: u.id }, { vendorOrderId: { in: orders.map((o) => o.id) } }] };
  }
  @Get() async list(@Actor() u: Principal) {
    return this.db.dispute.findMany({
      where: await this.scope(u),
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }
  @Post() async open(@Actor() u: Principal, @Body() b: unknown) {
    const d = input(
      z.object({
        vendorOrderId: z.string(),
        subject: z.string().trim().min(5).max(120),
        body: z.string().trim().min(10).max(4000),
      }),
      b,
    );
    const vo = await this.db.vendorOrder.findFirst({
      where: { id: d.vendorOrderId, order: { userId: u.id } },
      include: { order: true },
    });
    if (!vo) throw new NotFoundException();
    return this.db.atomic(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          vendorOrderId: vo.id,
          userId: u.id,
          subject: d.subject,
          messages: {
            create: { authorId: u.id, authorName: u.name, authorRole: u.role, body: d.body },
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'DISPUTE_OPENED',
          payload: { orderId: vo.orderId, userId: u.id, disputeId: dispute.id },
        },
      });
      return dispute;
    });
  }
  @Post(':id/messages') async reply(
    @Actor() u: Principal,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const d = input(z.object({ body: z.string().trim().min(1).max(4000) }), b);
    const dispute = await this.db.dispute.findFirst({ where: { id, ...(await this.scope(u)) } });
    if (!dispute) throw new NotFoundException();
    if (dispute.status !== 'OPEN') throw new BadRequestException('This case has been resolved');
    return this.db.atomic(async (tx) => {
      const message = await tx.disputeMessage.create({
        data: {
          disputeId: id,
          authorId: u.id,
          authorName: u.name,
          authorRole: u.role,
          body: d.body,
        },
      });
      await tx.dispute.update({ where: { id }, data: { updatedAt: new Date() } });
      const vo = await tx.vendorOrder.findUniqueOrThrow({ where: { id: dispute.vendorOrderId } });
      await tx.outboxEvent.create({
        data: {
          type: 'DISPUTE_UPDATED',
          payload: { orderId: vo.orderId, userId: dispute.userId, disputeId: id },
        },
      });
      return message;
    });
  }
  @Roles('PLATFORM_ADMIN', 'SUPPORT_AGENT') @Patch(':id') resolve(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const d = input(
      z.object({
        status: z.enum(['OPEN', 'RESOLVED']),
        resolution: z.string().trim().min(5).max(2000),
      }),
      b,
    );
    return this.db.dispute.update({ where: { id }, data: d });
  }
}
