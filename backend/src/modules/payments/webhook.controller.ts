import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  All,
  Res,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { config } from '../../config';
import { Prisma } from '@prisma/client';
import { Db } from '../../db';
import { Public } from '../../auth/access';
import { ProviderRegistry } from './registry';
import { clearPurchasedCart, finishReservations } from '../../checkout.service';
@Public()
@Controller('payments/webhooks')
export class WebhookController {
  constructor(
    private db: Db,
    private providers: ProviderRegistry,
  ) {}
  @All(':provider') async receive(
    @Param('provider') code: string,
    @Headers() headers: Record<string, unknown>,
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const provider = this.providers.get(code);
    const body = req.method === 'GET' ? req.query : req.body;
    let expected:
      { orderId: string; amountMinor: number; metadata?: Record<string, string> } | undefined;
    if (provider.callbackReference) {
      const ref = provider.callbackReference(body);
      const p = await this.db.payment.findFirst({ where: { provider: code, providerRef: ref } });
      if (!p) throw new BadRequestException('Unknown payment reference');
      expected = {
        orderId: p.orderId,
        amountMinor: p.amountMinor,
        metadata: (p.raw as { metadata?: Record<string, string> } | null)?.metadata,
      };
    }
    const event = await provider.parseWebhook(
      req.rawBody || Buffer.alloc(0),
      headers,
      body,
      expected,
    );
    const result = await this.db.atomic(async (tx) => {
      const duplicate = await tx.webhookEvent.findUnique({
        where: { provider_providerEventId: { provider: code, providerEventId: event.eventId } },
      });
      if (duplicate) return { received: true, duplicate: true };
      const payment = await tx.payment.findUnique({
        where: { providerRef: event.providerRef },
        include: { order: true },
      });
      if (!payment || payment.provider !== code || payment.amountMinor !== event.amountMinor)
        throw new BadRequestException('Payment reference or amount mismatch');
      await tx.webhookEvent.create({
        data: {
          provider: code,
          providerEventId: event.eventId,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
      if (payment.order.status !== 'PENDING_PAYMENT') {
        if (event.status === 'SUCCEEDED' && payment.status !== 'SUCCEEDED') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'SUCCEEDED', refundRef: event.refundRef },
          });
          const refund = await tx.refund.upsert({
            where: { idempotencyKey: `late:${payment.id}` },
            create: {
              paymentId: payment.id,
              amountMinor: payment.amountMinor,
              reason: `LATE:${payment.orderId}`,
              idempotencyKey: `late:${payment.id}`,
            },
            update: {},
          });
          await tx.outboxEvent.create({
            data: { type: 'REFUND_REQUESTED', payload: { refundId: refund.id } },
          });
        }
        return { received: true };
      }
      const success = event.status === 'SUCCEEDED';
      await finishReservations(tx, payment.orderId, success);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: event.status, refundRef: event.refundRef },
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: success ? 'PAID' : 'CANCELLED' },
      });
      await tx.vendorOrder.updateMany({
        where: { orderId: payment.orderId },
        data: { status: success ? 'AWAITING_FULFILLMENT' : 'CANCELLED' },
      });
      if (success) await clearPurchasedCart(tx, payment.orderId, payment.order.userId);
      await tx.outboxEvent.create({
        data: {
          type: success ? 'ORDER_CONFIRMED' : 'PAYMENT_FAILED',
          payload: { orderId: payment.orderId, userId: payment.order.userId },
        },
      });
      return { received: true };
    });
    if (req.method === 'GET' && res) return res.redirect(303, `${config.APP_URL}/orders`);
    return result;
  }
}
