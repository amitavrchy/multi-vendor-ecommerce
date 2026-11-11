import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { Db } from './db';
@Injectable()
export class DeliveryService {
  constructor(private db: Db) {}
  async deliver(
    eventId: string,
    input: { email: string; phone?: string; subject: string; text: string },
  ) {
    for (const channel of ['EMAIL', 'SMS']) {
      await this.db.deliveryReceipt.updateMany({
        where: {
          eventId,
          channel,
          status: 'PROCESSING',
          updatedAt: { lt: new Date(Date.now() - 60000) },
        },
        data: { status: 'FAILED', lastError: 'Delivery lease expired; retrying' },
      });
      const configured =
        channel === 'EMAIL' ? !!process.env.SMTP_URL : !!(process.env.SMS_URL && input.phone);
      const receipt = await this.db.deliveryReceipt.upsert({
        where: { eventId_channel: { eventId, channel } },
        create: { eventId, channel, status: configured ? 'PENDING' : 'SKIPPED' },
        update: {},
      });
      if (!configured || receipt.status === 'SENT') continue;
      if (receipt.status === 'PROCESSING')
        throw new Error('A delivery attempt is still processing');
      const claim = await this.db.deliveryReceipt.updateMany({
        where: {
          id: receipt.id,
          status: { in: ['PENDING', 'FAILED', 'SKIPPED'] },
          attempts: { lt: 20 },
        },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (!claim.count) continue;
      try {
        let providerRef: string;
        if (channel === 'EMAIL') {
          const transport = nodemailer.createTransport(process.env.SMTP_URL!);
          const sent = await transport.sendMail({
            from: process.env.SMTP_FROM || 'Bazaar <no-reply@bazaar.local>',
            to: input.email,
            subject: input.subject,
            text: input.text,
            messageId: `<${eventId}@${new URL(process.env.APP_URL || 'http://localhost').hostname}>`,
          });
          providerRef = sent.messageId;
        } else {
          const response = await fetch(process.env.SMS_URL!, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.SMS_AUTH_TOKEN
                ? { Authorization: `Bearer ${process.env.SMS_AUTH_TOKEN}` }
                : {}),
            },
            body: JSON.stringify({ to: input.phone, body: input.text, idempotencyKey: eventId }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error('SMS delivery failed');
          providerRef = (await response.json()).id || eventId;
        }
        await this.db.deliveryReceipt.update({
          where: { id: receipt.id },
          data: { status: 'SENT', providerRef, lastError: null },
        });
      } catch (e) {
        await this.db.deliveryReceipt.update({
          where: { id: receipt.id },
          data: { status: 'FAILED', lastError: e instanceof Error ? e.message : 'Delivery failed' },
        });
        throw new Error(`${channel} delivery failed; retry scheduled`);
      }
    }
  }
}
