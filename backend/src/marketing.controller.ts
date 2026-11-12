import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Public, Roles } from './auth/access';
import { Db } from './db';
import { config } from './config';
import { encrypt, decrypt } from './common/security';
import { input } from './common/input';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function prepareCampaigns(db: Db) {
  const campaigns = await db.campaign.findMany({
    where: { status: { in: ['SCHEDULED', 'SENDING'] }, scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: 5,
    select: { id: true },
  });
  for (const { id } of campaigns)
    await db.atomic(async (tx) => {
      const c = await tx.campaign.findUniqueOrThrow({ where: { id } });
      if (
        !['SCHEDULED', 'SENDING'].includes(c.status) ||
        !c.scheduledAt ||
        c.scheduledAt > new Date()
      )
        return;
      const people = await tx.marketingSubscriber.findMany({
        where: {
          status: 'CONFIRMED',
          ...(c.cursor ? { id: { gt: c.cursor } } : {}),
          ...(c.audience === 'BUSINESS' ? { user: { business: { status: 'APPROVED' } } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const p of people) {
        const token = decrypt(p.tokenCipher, config.BANK_ENCRYPTION_KEY);
        await tx.outboxEvent.createMany({
          data: [
            {
              id: `campaign:${id}:${p.id}`,
              campaignId: id,
              type: 'MARKETING_MESSAGE',
              payload: {
                subscriberId: p.id,
                email: p.email,
                title: c.title,
                body: c.body,
                path: `/newsletter?unsubscribe=${token}`,
              },
            },
          ],
          skipDuplicates: true,
        });
      }
      await tx.campaign.update({
        where: { id },
        data: {
          status: people.length < 50 ? 'QUEUED' : 'SENDING',
          ...(people.length ? { cursor: people[people.length - 1].id } : {}),
        },
      });
    });
}
@Controller('marketing')
export class MarketingController {
  constructor(private db: Db) {}
  @Public() @Post('subscribe') async subscribe(@Body() body: unknown) {
    const d = input(
      z.object({ email: z.email().trim().toLowerCase(), consent: z.literal(true) }),
      body,
    );
    if (!process.env.SMTP_URL)
      throw new ServiceUnavailableException(
        'Email subscriptions are not available yet. Please try again later.',
      );
    return this.db.atomic(async (tx) => {
      const existing = await tx.marketingSubscriber.findUnique({ where: { email: d.email } });
      if (
        existing?.status === 'CONFIRMED' ||
        (existing?.status === 'PENDING' && Date.now() - existing.consentAt.getTime() < 300000)
      )
        return { ok: true };
      const token = existing
        ? decrypt(existing.tokenCipher, config.BANK_ENCRYPTION_KEY)
        : randomBytes(32).toString('hex');
      const user = await tx.user.findUnique({ where: { email: d.email }, select: { id: true } });
      const data = {
        status: 'PENDING',
        userId: user?.id ?? null,
        confirmationExpiresAt: new Date(Date.now() + 86400000),
        consentAt: new Date(),
      };
      const p = await tx.marketingSubscriber.upsert({
        where: { email: d.email },
        create: {
          email: d.email,
          ...data,
          tokenHash: digest(token),
          tokenCipher: encrypt(token, config.BANK_ENCRYPTION_KEY),
        },
        update: data,
      });
      await tx.outboxEvent.create({
        data: {
          type: 'MARKETING_CONFIRMATION',
          payload: {
            subscriberId: p.id,
            email: p.email,
            title: 'Confirm your Bazaar updates',
            body: 'Confirm to receive curated finds and marketplace offers. You can unsubscribe any time.',
            path: `/newsletter?confirm=${token}`,
          },
        },
      });
      return { ok: true };
    });
  }
  @Public() @Post('confirm') async confirm(@Body() body: unknown) {
    const { token } = input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }), body);
    const result = await this.db.marketingSubscriber.updateMany({
      where: {
        tokenHash: digest(token),
        status: 'PENDING',
        confirmationExpiresAt: { gt: new Date() },
      },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmationExpiresAt: null },
    });
    if (
      !result.count &&
      !(await this.db.marketingSubscriber.findFirst({
        where: { tokenHash: digest(token), status: 'CONFIRMED' },
      }))
    )
      throw new BadRequestException('Confirmation link is invalid or expired');
    return { ok: true };
  }
  @Public() @Post('unsubscribe') async unsubscribe(@Body() body: unknown) {
    const { token } = input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }), body);
    await this.db.marketingSubscriber.updateMany({
      where: { tokenHash: digest(token) },
      data: { status: 'UNSUBSCRIBED', confirmationExpiresAt: null },
    });
    return { ok: true };
  }
  @Roles('PLATFORM_ADMIN') @Get('campaigns') async list() {
    const campaigns = await this.db.campaign.findMany({
      include: { _count: { select: { events: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(
      campaigns.map(async (c) => ({
        ...c,
        delivered: await this.db.deliveryReceipt.count({
          where: { channel: 'EMAIL', status: 'SENT', event: { campaignId: c.id } },
        }),
      })),
    );
  }
  @Roles('PLATFORM_ADMIN') @Get('audience') async audience() {
    return {
      confirmed: await this.db.marketingSubscriber.count({ where: { status: 'CONFIRMED' } }),
      business: await this.db.marketingSubscriber.count({
        where: { status: 'CONFIRMED', user: { business: { status: 'APPROVED' } } },
      }),
    };
  }
  @Roles('PLATFORM_ADMIN') @Post('campaigns') create(@Body() body: unknown) {
    const d = input(
      z.object({
        title: z.string().trim().min(5).max(150),
        body: z.string().trim().min(20).max(5000),
        audience: z.enum(['ALL', 'BUSINESS']),
      }),
      body,
    );
    return this.db.campaign.create({ data: d });
  }
  @Roles('PLATFORM_ADMIN') @Post('campaigns/:id/schedule') async schedule(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const d = input(z.object({ scheduledAt: z.iso.datetime().optional() }), body);
    if (!process.env.SMTP_URL)
      throw new ServiceUnavailableException('Configure email delivery before scheduling campaigns');
    const when = d.scheduledAt ? new Date(d.scheduledAt) : new Date();
    if (when.getTime() < Date.now() - 60000 || when.getTime() > Date.now() + 365 * 86400000)
      throw new BadRequestException('Choose a schedule within the coming year');
    const result = await this.db.campaign.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: { status: 'SCHEDULED', scheduledAt: when },
    });
    if (!result.count) throw new BadRequestException('Campaign cannot be scheduled');
    return { ok: true };
  }
  @Roles('PLATFORM_ADMIN') @Post('campaigns/:id/cancel') async cancel(@Param('id') id: string) {
    await this.db.campaign.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'SENDING', 'QUEUED'] } },
      data: { status: 'CANCELLED' },
    });
    return { ok: true };
  }
}
