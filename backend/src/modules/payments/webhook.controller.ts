import { BadRequestException, Controller, Headers, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { Db } from '../../db';
import { Public } from '../../auth/access';
import { ProviderRegistry } from './registry';
import { clearPurchasedCart, finishReservations } from '../../checkout.service';
@Public() @Controller('payments/webhooks')
export class WebhookController {
  constructor(private db:Db,private providers:ProviderRegistry) {}
  @Post(':provider') async receive(@Param('provider') code:string,@Headers() headers:Record<string,unknown>,@Req() req:RawBodyRequest<Request>) {
    const provider=this.providers.get(code); const event=await provider.parseWebhook(req.rawBody||Buffer.alloc(0),headers,req.body);
    return this.db.atomic(async tx=>{
      const duplicate=await tx.webhookEvent.findUnique({where:{provider_providerEventId:{provider:code,providerEventId:event.eventId}}}); if(duplicate) return {received:true,duplicate:true};
      const payment=await tx.payment.findUnique({where:{providerRef:event.providerRef},include:{order:true}});
      if(!payment || payment.provider!==code || payment.amountMinor!==event.amountMinor) throw new BadRequestException('Payment reference or amount mismatch');
      await tx.webhookEvent.create({data:{provider:code,providerEventId:event.eventId,payload:event as unknown as Prisma.InputJsonValue}});
      if(payment.order.status!=='PENDING_PAYMENT') { if(event.status==='SUCCEEDED'&&payment.status!=='SUCCEEDED') await tx.outboxEvent.create({data:{type:'LATE_PAYMENT_REVIEW',payload:{orderId:payment.orderId,userId:payment.order.userId}}}); return {received:true}; }
      const success=event.status==='SUCCEEDED'; await finishReservations(tx,payment.orderId,success);
      await tx.payment.update({where:{id:payment.id},data:{status:event.status}});
      await tx.order.update({where:{id:payment.orderId},data:{status:success?'PAID':'CANCELLED'}});
      await tx.vendorOrder.updateMany({where:{orderId:payment.orderId},data:{status:success?'AWAITING_FULFILLMENT':'CANCELLED'}});
      if(success) await clearPurchasedCart(tx,payment.orderId,payment.order.userId);
      await tx.outboxEvent.create({data:{type:success?'ORDER_CONFIRMED':'PAYMENT_FAILED',payload:{orderId:payment.orderId,userId:payment.order.userId}}});
      return {received:true};
    });
  }
}
