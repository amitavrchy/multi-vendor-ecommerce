import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from './db';
import { ProviderRegistry } from './modules/payments/registry';
import { RefundContext } from './modules/payments/refund';
import { PaymentProvider } from './modules/payments/provider';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { reconcileRewards } from './rewards.controller';
@Injectable()
export class RefundsService {
  constructor(
    private db: Db,
    private providers: ProviderRegistry,
  ) {}
  async process(id: string, force = false) {
    const r = await this.db.refund.findUniqueOrThrow({ where: { id }, include: { payment: true } });
    if (!['PENDING', 'PROCESSING'].includes(r.status)) return;
    const now = new Date();
    const leaseToken = randomUUID();
    if (!force && r.attempts > 0 && r.nextCheckAt > now) return;
    const claim = await this.db.refund.updateMany({
      where: { id, status: r.status, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseUntil: new Date(now.getTime() + 60000), leaseToken, attempts: { increment: 1 } },
    });
    if (!claim.count) return;
    const release = (data: Prisma.RefundUpdateManyMutationInput) =>
      this.db.refund.updateMany({
        where: { id, leaseToken },
        data: { ...data, leaseUntil: null, leaseToken: null },
      });
    const context: RefundContext = {
      paymentRef: r.payment.providerRef!,
      transactionRef: r.payment.refundRef || undefined,
      amountMinor: r.amountMinor,
      idempotencyKey: r.idempotencyKey,
    };
    let adapter: PaymentProvider | undefined;
    const checking = !!(r.status === 'PROCESSING' && r.providerRef);
    try {
      adapter = this.providers.get(r.payment.provider);
      if (!checking && r.attempts > 0 && Date.now() - r.createdAt.getTime() > 23 * 3600000) {
        await release({
          status: 'MANUAL_REVIEW',
          lastError: 'Verify the gateway before retrying an expired idempotency window',
        });
        return;
      }
      if (!checking && !adapter.refundRetrySafe)
        await this.db.refund.updateMany({
          where: { id, leaseToken },
          data: {
            status: 'MANUAL_REVIEW',
            lastError: 'Gateway submission in progress; verify its outcome if interrupted',
          },
        });
      const result = checking
        ? adapter.checkRefund
          ? await adapter.checkRefund(r.providerRef!, context)
          : { providerRef: r.providerRef!, status: 'MANUAL_REVIEW' as const }
        : await adapter.refund(
            r.payment.refundRef || r.payment.providerRef!,
            r.amountMinor,
            r.idempotencyKey,
            context,
          );
      const status = result.status === 'PENDING' ? 'MANUAL_REVIEW' : result.status || 'SUCCEEDED';
      if (status === 'SUCCEEDED') {
        await this.complete(id, result.providerRef, leaseToken);
        return;
      }
      await release({
        status,
        providerRef: result.providerRef,
        failureCount: 0,
        nextCheckAt: new Date(Date.now() + Math.min(1800000, 30000 * 2 ** Math.min(r.attempts, 6))),
        lastError:
          status === 'FAILED'
            ? 'The provider reported that the refund failed'
            : status === 'MANUAL_REVIEW'
              ? 'Operator reconciliation is required'
              : null,
      });
    } catch (error) {
      const manual = (!checking && !adapter?.refundRetrySafe) || r.failureCount >= 19;
      await release({
        status: manual ? 'MANUAL_REVIEW' : r.status,
        failureCount: { increment: 1 },
        nextCheckAt: new Date(
          Date.now() + Math.min(1800000, 30000 * 2 ** Math.min(r.failureCount, 6)),
        ),
        lastError: error instanceof Error ? error.message : 'Refund reconciliation failed',
      });
    }
  }
  async reconcileDue() {
    const due = await this.db.refund.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        nextCheckAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: { id: true },
    });
    for (const r of due) await this.process(r.id);
  }
  async complete(id: string, providerRef: string, leaseToken?: string) {
    return this.db.atomic(async (tx) => {
      const r = await tx.refund.findUnique({ where: { id }, include: { payment: true } });
      if (!r) throw new NotFoundException();
      if (r.status === 'SUCCEEDED') return r;
      if (leaseToken && r.leaseToken !== leaseToken) return { ok: true, ignored: true };
      if (!leaseToken && r.leaseUntil && r.leaseUntil > new Date())
        throw new BadRequestException('A gateway refund attempt is still processing');
      if (!['PENDING', 'PROCESSING', 'MANUAL_REVIEW'].includes(r.status))
        throw new BadRequestException('Refund is not awaiting settlement');
      await tx.refund.update({
        where: { id },
        data: {
          status: 'SUCCEEDED',
          providerRef,
          leaseUntil: null,
          leaseToken: null,
          lastError: null,
          failureCount: 0,
        },
      });
      await tx.payment.update({
        where: { id: r.paymentId },
        data: { refundedMinor: { increment: r.amountMinor } },
      });
      const [kind, voId] = r.reason.split(':');
      if (kind === 'LATE') {
        const order = await tx.order.findUniqueOrThrow({ where: { id: r.payment.orderId } });
        await tx.outboxEvent.create({
          data: {
            type: 'REFUND_COMPLETED',
            payload: { orderId: order.id, userId: order.userId, amountMinor: r.amountMinor },
          },
        });
        return { ok: true };
      }
      const vo = await tx.vendorOrder.findUniqueOrThrow({
        where: { id: voId },
        include: { order: true, lines: true },
      });
      if (kind === 'RETURN') {
        const rma = r.returnRequestId
          ? await tx.returnRequest.findUniqueOrThrow({ where: { id: r.returnRequestId } })
          : await tx.returnRequest.findFirstOrThrow({
              where: { vendorOrderId: vo.id, status: 'ITEM_RECEIVED' },
            });
        const clawback = rma.clawbackMinor;
        const sale = await tx.vendorLedgerEntry.findUnique({
          where: { refId: `delivery:${vo.id}` },
        });
        if (sale) {
          await tx.vendorLedgerEntry.create({
            data: {
              vendorId: vo.vendorId,
              type: 'REFUND_CLAWBACK',
              amountMinor: -clawback,
              refId: `refund:${id}`,
            },
          });
          await tx.vendorBalance.update({
            where: { vendorId: vo.vendorId },
            data: { availableMinor: { decrement: clawback } },
          });
        }
        await tx.returnRequest.update({
          where: { id: rma.id },
          data: { status: 'REFUNDED' },
        });
        for (const returned of rma.lines as { lineId: string; qty: number }[]) {
          const line = vo.lines.find((l) => l.id === returned.lineId)!;
          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { stockQty: { increment: returned.qty } },
          });
        }
        const siblings = await tx.vendorOrder.findMany({
          where: { orderId: vo.orderId },
          include: { returns: true, lines: true },
        });
        if (
          siblings.every(
            (s) =>
              s.status === 'CANCELLED' ||
              s.lines.every(
                (line) =>
                  s.returns
                    .filter((t) => t.status === 'REFUNDED')
                    .flatMap((t) => t.lines as { lineId: string; qty: number }[])
                    .filter((l) => l.lineId === line.id)
                    .reduce((sum, l) => sum + l.qty, 0) === line.qty,
              ),
          )
        )
          await tx.order.update({ where: { id: vo.orderId }, data: { status: 'RETURNED' } });
      }
      await reconcileRewards(tx, vo.orderId, `refund:${id}`);
      await tx.outboxEvent.create({
        data: {
          type: 'REFUND_COMPLETED',
          payload: { orderId: vo.orderId, userId: vo.order.userId, amountMinor: r.amountMinor },
        },
      });
      return { ok: true };
    });
  }
}
