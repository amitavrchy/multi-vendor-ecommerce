import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal, Roles } from './auth/access';
import { input, slugSchema } from './common/input';
import { VendorScope } from './vendor-scope.service';
import { encrypt } from './common/security';
import { config } from './config';
@Controller('vendor')
export class VendorController {
  constructor(
    private db: Db,
    private scope: VendorScope,
  ) {}
  @Roles('CUSTOMER') @Post('apply') async apply(@Actor() u: Principal, @Body() b: unknown) {
    const d = input(
      z.object({
        storeName: z.string().min(3).max(100),
        slug: slugSchema,
        description: z.string().max(1000),
      }),
      b,
    );
    if (await this.db.vendor.findFirst({ where: { OR: [{ ownerId: u.id }, { slug: d.slug }] } }))
      throw new BadRequestException('You already have a store or this store URL is taken');
    return this.db.atomic(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { role: 'VENDOR_OWNER' } });
      return tx.vendor.create({
        data: {
          ...d,
          ownerId: u.id,
          commissionBps: config.DEFAULT_COMMISSION_BPS,
          balance: { create: {} },
        },
      });
    });
  }
  @Roles('VENDOR_OWNER', 'VENDOR_STAFF') @Get('me') async me(@Actor() u: Principal) {
    const v = await this.scope.get(u);
    return this.db.vendor.findUnique({
      where: { id: v.id },
      select: {
        id: true,
        storeName: true,
        slug: true,
        status: true,
        description: true,
        commissionBps: true,
        kyc: true,
        balance: true,
        bankEncrypted: false,
      },
    });
  }
  @Roles('VENDOR_OWNER') @Post('kyc') async kyc(@Actor() u: Principal, @Body() b: unknown) {
    const d = input(
      z
        .object({
          legalName: z.string().min(3).max(120),
          tradeLicense: z.string().min(5).max(100),
          documentId: z.string().optional(),
          documentUrl: z
            .url()
            .refine((v) => v.startsWith('https://'), 'Use a secure document URL')
            .optional(),
        })
        .refine(
          (v) => !!(v.documentId || v.documentUrl),
          'Upload a document or provide its secure URL',
        ),
      b,
    );
    const v = await this.scope.get(u, true);
    if (
      d.documentId &&
      !(await this.db.upload.findFirst({ where: { id: d.documentId, userId: u.id, scope: 'KYC' } }))
    )
      throw new BadRequestException('Invalid verification upload');
    if (!['APPLIED', 'REJECTED', 'KYC_PENDING'].includes(v.status))
      throw new BadRequestException('KYC cannot be changed in this state');
    return this.db.atomic(async (tx) => {
      await tx.vendor.update({ where: { id: v.id }, data: { status: 'KYC_PENDING' } });
      return tx.vendorKyc.upsert({
        where: { vendorId: v.id },
        create: { vendorId: v.id, documents: d },
        update: { documents: d, status: 'KYC_PENDING', note: null, reviewedAt: null },
      });
    });
  }
  @Roles('VENDOR_OWNER') @Patch('settings') async settings(
    @Actor() u: Principal,
    @Body() b: unknown,
  ) {
    const d = input(
      z.object({
        storeName: z.string().min(3).max(100),
        description: z.string().max(1000),
        bankDetails: z.string().min(8).max(500).optional(),
      }),
      b,
    );
    const v = await this.scope.get(u, true);
    await this.db.vendor.update({
      where: { id: v.id },
      data: {
        storeName: d.storeName,
        description: d.description,
        ...(d.bankDetails
          ? { bankEncrypted: encrypt(d.bankDetails, config.BANK_ENCRYPTION_KEY) }
          : {}),
      },
    });
    return { ok: true };
  }
  @Roles('VENDOR_OWNER') @Post('team') async team(@Actor() u: Principal, @Body() b: unknown) {
    const { email } = input(z.object({ email: z.email() }), b);
    const v = await this.scope.get(u, true);
    const member = await this.db.user.findUnique({ where: { email } });
    if (!member || member.role !== 'CUSTOMER')
      throw new BadRequestException('Choose an existing customer account');
    return this.db.atomic(async (tx) => {
      await tx.user.update({ where: { id: member.id }, data: { role: 'VENDOR_STAFF' } });
      return tx.vendorMember.create({ data: { vendorId: v.id, userId: member.id } });
    });
  }
  @Roles('VENDOR_OWNER') @Get('team') async members(@Actor() u: Principal) {
    const v = await this.scope.get(u, true);
    const members = await this.db.vendorMember.findMany({ where: { vendorId: v.id } });
    return this.db.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, name: true, email: true, role: true },
    });
  }
  @Roles('VENDOR_OWNER') @Delete('team/:id') async removeMember(
    @Actor() u: Principal,
    @Param('id') id: string,
  ) {
    const v = await this.scope.get(u, true);
    return this.db.atomic(async (tx) => {
      const membership = await tx.vendorMember.findFirst({ where: { userId: id, vendorId: v.id } });
      if (!membership) throw new BadRequestException('Team member not found');
      await tx.vendorMember.delete({ where: { id: membership.id } });
      await tx.user.update({ where: { id }, data: { role: 'CUSTOMER' } });
      return { ok: true };
    });
  }
  @Roles('VENDOR_OWNER', 'VENDOR_STAFF') @Get('stats') async stats(@Actor() u: Principal) {
    const v = await this.scope.get(u);
    const [products, orders, balance, recent, ledger] = await Promise.all([
      this.db.product.count({ where: { vendorId: v.id } }),
      this.db.vendorOrder.count({ where: { vendorId: v.id } }),
      this.db.vendorBalance.findUnique({ where: { vendorId: v.id } }),
      this.db.vendorOrder.findMany({
        where: { vendorId: v.id },
        include: { lines: true },
        orderBy: { order: { createdAt: 'desc' } },
        take: 8,
      }),
      this.db.vendorLedgerEntry.findMany({
        where: { vendorId: v.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { products, orders, balance, recent, ledger };
  }
}
