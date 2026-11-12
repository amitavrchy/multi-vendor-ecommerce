import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Db } from './db';
import { CheckoutService } from './checkout.service';
import { RefundsService } from './refunds.service';
import { RealtimeGateway } from './realtime.gateway';
import { config } from './config';
import { DeliveryService } from './delivery.service';
import { PayoutsController } from './payouts.controller';
import { CacheService } from './cache.service';
import { ProviderRegistry } from './modules/payments/registry';
import { WebhookController } from './modules/payments/webhook.controller';
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
    private delivery: DeliveryService,
    private cache: CacheService,
    private providers: ProviderRegistry,
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
      await this.refunds.reconcileDue();
      const pendingPayments = await this.db.payment.findMany({
        where: {
          status: 'REQUIRES_ACTION',
          provider: { in: this.providers.reconciliationCodes() },
          nextCheckAt: { lte: new Date() },
          providerRef: { not: null },
          order: { status: 'PENDING_PAYMENT' },
        },
        take: 10,
        orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      });
      for (const payment of pendingPayments) {
        const claim = await this.db.payment.updateMany({
          where: { id: payment.id, status: 'REQUIRES_ACTION', nextCheckAt: { lte: new Date() } },
          data: { nextCheckAt: new Date(Date.now() + 60000) },
        });
        if (!claim.count) continue;
        let adapter;
        try {
          adapter = this.providers.get(payment.provider);
        } catch {
          continue;
        }
        if (adapter.reconciliationBody) {
          try {
            await new WebhookController(this.db, this.providers).receive(payment.provider, {}, {
              method: 'POST',
              body: adapter.reconciliationBody(payment.providerRef!),
              rawBody: Buffer.alloc(0),
            } as never);
          } catch {
            /* Pending provider results are retried; only verified terminal states settle. */
          }
        }
      }
      const expired = await this.db.stockReservation.findMany({
        where: { status: 'RESERVED', expiresAt: { lt: new Date() } },
        select: { orderId: true },
        distinct: ['orderId'],
        take: 100,
      });
      for (const r of expired) await this.checkout.cancelPending(r.orderId);
      const policy = await this.db.platformPolicy.findUnique({ where: { id: 'marketplace' } });
      const delivered = await this.db.$queryRaw<
        { id: string; orderId: string; userId: string }[]
      >`SELECT vo.id,vo."orderId",o."userId" FROM "VendorOrder" vo JOIN "Order" o ON o.id=vo."orderId" WHERE vo.status='DELIVERED' AND vo."deliveredAt"<=${new Date(Date.now() - (policy?.reviewDelayDays ?? 3) * 86400000)} AND NOT EXISTS(SELECT 1 FROM "OutboxEvent" e WHERE e.id='review:'||vo.id) ORDER BY vo."deliveredAt" ASC LIMIT 100`;
      for (const vo of delivered)
        await this.db.outboxEvent.upsert({
          where: { id: `review:${vo.id}` },
          create: {
            id: `review:${vo.id}`,
            type: 'REVIEW_REQUESTED',
            payload: { orderId: vo.orderId, userId: vo.userId },
          },
          update: {},
        });
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const weekday = new Date(`${today}T12:00:00+06:00`).getUTCDay();
      if (policy?.weeklyPayouts && weekday === policy.payoutWeekday) {
        try {
          await new PayoutsController(this.db).run(`weekly:${today}`);
        } catch (e) {
          if (!(e instanceof Error && e.message.includes('No eligible'))) throw e;
        }
      }
      const events = await this.db.outboxEvent.findMany({
        where: { processedAt: null, attempts: { lt: 20 } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const event of events) {
        try {
          const p = event.payload as Record<string, string>;
          if (event.type === 'CACHE_INVALIDATION') await this.cache.purge();
          else if (event.type === 'REFUND_REQUESTED') await this.refunds.process(p.refundId);
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
            const user = await this.db.user.findUniqueOrThrow({ where: { id: p.userId } });
            const order = await this.db.order.findUnique({ where: { id: p.orderId } });
            const phone = (order?.shippingAddress as { phone?: string } | null)?.phone;
            await this.delivery.deliver(event.id, {
              email: user.email,
              phone,
              subject: `Bazaar · ${title}`,
              text: `${title[0].toUpperCase() + title.slice(1)} for order ${p.orderId.slice(-8).toUpperCase()}. View your order: ${config.APP_URL}/orders`,
            });
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
      if (events.length || expired.length) await this.cache.invalidate(false);
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
