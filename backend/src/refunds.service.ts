import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from './db';
import { ProviderRegistry } from './modules/payments/registry';
@Injectable()
export class RefundsService {
  constructor(private db:Db,private providers:ProviderRegistry) {}
  async process(id:string) {
    const r=await this.db.refund.findUniqueOrThrow({where:{id},include:{payment:true}});
    if(r.status!=='PENDING') return;
    const result=await this.providers.get(r.payment.provider).refund(r.payment.providerRef!,r.amountMinor,r.idempotencyKey);
    if(result.status==='PENDING') { await this.db.refund.update({where:{id},data:{status:'MANUAL_REVIEW',providerRef:result.providerRef}});return; }
    await this.complete(id,result.providerRef);
  }
  async complete(id:string,providerRef:string) {
    return this.db.atomic(async tx=>{
      const r=await tx.refund.findUnique({where:{id},include:{payment:true}});if(!r) throw new NotFoundException();if(r.status==='SUCCEEDED') return r;
      if(!['PENDING','MANUAL_REVIEW'].includes(r.status)) throw new BadRequestException('Refund is not awaiting settlement');
      await tx.refund.update({where:{id},data:{status:'SUCCEEDED',providerRef}});
      await tx.payment.update({where:{id:r.paymentId},data:{refundedMinor:{increment:r.amountMinor}}});
      const [kind,voId]=r.reason.split(':'); const vo=await tx.vendorOrder.findUniqueOrThrow({where:{id:voId},include:{order:true,lines:true}});
      if(kind==='RETURN') {
        const sale=await tx.vendorLedgerEntry.findUnique({where:{refId:`delivery:${vo.id}`}});
        if(sale) {
          await tx.vendorLedgerEntry.create({data:{vendorId:vo.vendorId,type:'REFUND_CLAWBACK',amountMinor:-vo.vendorNetMinor,refId:`refund:${id}`}});
          await tx.vendorBalance.update({where:{vendorId:vo.vendorId},data:{availableMinor:{decrement:vo.vendorNetMinor}}});
        }
        await tx.returnRequest.update({where:{vendorOrderId:vo.id},data:{status:'REFUNDED'}});
        for(const line of vo.lines) await tx.productVariant.update({where:{id:line.variantId},data:{stockQty:{increment:line.qty}}});
        const siblings=await tx.vendorOrder.findMany({where:{orderId:vo.orderId},include:{returns:true}});
        if(siblings.every(s=>s.status==='CANCELLED'||s.returns.some(t=>t.status==='REFUNDED'))) await tx.order.update({where:{id:vo.orderId},data:{status:'RETURNED'}});
      }
      await tx.outboxEvent.create({data:{type:'REFUND_COMPLETED',payload:{orderId:vo.orderId,userId:vo.order.userId,amountMinor:r.amountMinor}}});return {ok:true};
    });
  }
}
