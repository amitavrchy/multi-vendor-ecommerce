import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Db } from './db';
import { CheckoutService } from './checkout.service';
import { RefundsService } from './refunds.service';
import { RealtimeGateway } from './realtime.gateway';
import { config } from './config';
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private queue?: Queue;
  private worker?: Worker;
  private logger = new Logger(JobsService.name);
  constructor(
    private db: Db,
    private checkout: CheckoutService,
    private refunds: RefundsService,
    private live: RealtimeGateway,
  ) {}
  async onModuleInit() {
    if (config.REDIS_URL) {
      const url = new URL(config.REDIS_URL);
      const connection = {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      };
      this.queue = new Queue('bazaar-maintenance', { connection });
      this.worker = new Worker('bazaar-maintenance', () => this.tick(), {
        connection,
        concurrency: 1,
      });
      this.worker.on('error', (e) => this.logger.error(e.message));
      this.queue.on('error', (e) => this.logger.error(e.message));
      await this.queue.upsertJobScheduler(
        'maintenance',
        { every: 10000 },
        { name: 'tick', opts: { removeOnComplete: 10, removeOnFail: 20 } },
      );
    } else {
      this.logger.warn('REDIS_URL absent: single-process maintenance scheduler is active');
      this.timer = setInterval(() => void this.tick(), 10000);
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const expired = await this.db.stockReservation.findMany({
        where: { status: 'RESERVED', expiresAt: { lt: new Date() } },
        select: { orderId: true },
        distinct: ['orderId'],
        take: 100,
      });
      for (const r of expired) await this.checkout.cancelPending(r.orderId);
      const events = await this.db.outboxEvent.findMany({
        where: { processedAt: null, attempts: { lt: 20 } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const event of events) {
        try {
          const p = event.payload as Record<string, string>;
          if (event.type === 'REFUND_REQUESTED') await this.refunds.process(p.refundId);
          else if (p.userId) {
            const title = event.type.toLowerCase().replaceAll('_', ' ');
            await this.db.notification.upsert({
              where: { eventId: event.id },
              create: {
                eventId: event.id,
                userId: p.userId,
                title: title[0].toUpperCase() + title.slice(1),
                body: `Order ${p.orderId.slice(-8).toUpperCase()}${p.status ? `: ${p.status.toLowerCase().replaceAll('_', ' ')}` : ''}`,
              },
              update: {},
            });
            this.live.notify(`user:${p.userId}`, 'order.status_changed', p);
            if (event.type === 'ORDER_CONFIRMED') {
              const vos = await this.db.vendorOrder.findMany({ where: { orderId: p.orderId } });
              for (const vo of vos)
                this.live.notify(`vendor:${vo.vendorId}`, 'order.new', { orderId: vo.id });
            }
          }
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date(), lastError: null },
          });
        } catch (e) {
          await this.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts: { increment: 1 },
              lastError: e instanceof Error ? e.message : 'Processing failed',
            },
          });
        }
      }
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : e);
    } finally {
      this.busy = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
