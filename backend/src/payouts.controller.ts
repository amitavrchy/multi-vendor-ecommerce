import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Roles } from './auth/access';
import { input } from './common/input';
@Roles('PLATFORM_ADMIN') @Controller('payouts')
export class PayoutsController {
  constructor(private db:Db) {}
  @Get() list() {return this.db.payoutBatch.findMany({include:{items:{include:{vendorOrder:{include:{vendor:{select:{storeName:true}}}}}}},orderBy:{scheduledFor:'desc'},take:50});}
  @Post('run') async run() {
    return this.db.atomic(async tx=>{
      const orders=await tx.vendorOrder.findMany({where:{status:'DELIVERED',payout:null,returns:{none:{status:{not:'REJECTED'}}},vendor:{status:'ACTIVE',bankEncrypted:{not:null}}}});
      const eligible:typeof orders=[];const remaining=new Map<string,number>();
      for(const o of orders) {
        if(!remaining.has(o.vendorId)) remaining.set(o.vendorId,(await tx.vendorBalance.findUnique({where:{vendorId:o.vendorId}}))?.availableMinor||0);
        if(remaining.get(o.vendorId)!>=o.vendorNetMinor) {eligible.push(o);remaining.set(o.vendorId,remaining.get(o.vendorId)!-o.vendorNetMinor);}
      }
      if(!eligible.length) throw new BadRequestException('No eligible delivered orders with verified bank details');
      const batch=await tx.payoutBatch.create({data:{status:'OPEN'}});
      for(const o of eligible) {
        await tx.payoutItem.create({data:{batchId:batch.id,vendorId:o.vendorId,vendorOrderId:o.id,amountMinor:o.vendorNetMinor}});
        await tx.vendorBalance.update({where:{vendorId:o.vendorId},data:{availableMinor:{decrement:o.vendorNetMinor},pendingMinor:{increment:o.vendorNetMinor}}});
      }
      return batch;
    });
  }
  @Post(':id/confirm') async confirm(@Param('id') id:string,@Body() b:unknown) {
    const d=input(z.object({transferReference:z.string().min(5).max(150)}),b);
    return this.db.atomic(async tx=>{
      const batch=await tx.payoutBatch.findUniqueOrThrow({where:{id},include:{items:true}});if(batch.status==='PAID') return batch;
      for(const item of batch.items) {
        await tx.vendorBalance.update({where:{vendorId:item.vendorId},data:{pendingMinor:{decrement:item.amountMinor}}});
        await tx.vendorLedgerEntry.create({data:{vendorId:item.vendorId,type:'PAYOUT',amountMinor:-item.amountMinor,refId:`payout:${item.id}:${d.transferReference}`}});
      }
      return tx.payoutBatch.update({where:{id},data:{status:'PAID'}});
    });
  }
}
