import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Roles } from './auth/access';
import { input } from './common/input';
@Roles('PLATFORM_ADMIN','SUPPORT_AGENT') @Controller('admin')
export class AdminController {
  constructor(private db:Db) {}
  @Get('overview') async overview() {
    const [users,vendors,orders,sales,pendingKyc,pendingProducts]=await Promise.all([this.db.user.count(),this.db.vendor.count(),this.db.order.count(),this.db.order.aggregate({where:{status:{in:['PAID','PARTIALLY_FULFILLED','FULFILLED']}},_sum:{grandMinor:true}}),this.db.vendor.count({where:{status:'KYC_PENDING'}}),this.db.product.count({where:{status:'DRAFT'}})]);return {users,vendors,orders,salesMinor:sales._sum.grandMinor||0,pendingKyc,pendingProducts};
  }
  @Roles('PLATFORM_ADMIN') @Get('vendors') vendors() {return this.db.vendor.findMany({include:{kyc:true,owner:{select:{email:true}},balance:true},omit:{bankEncrypted:true},orderBy:{createdAt:'desc'}});}
  @Roles('PLATFORM_ADMIN') @Patch('vendors/:id') reviewVendor(@Param('id') id:string,@Body() b:unknown) {
    const d=input(z.object({status:z.enum(['ACTIVE','REJECTED','SUSPENDED']),commissionBps:z.number().int().min(0).max(10000).optional(),note:z.string().max(1000).optional()}),b);
    return this.db.atomic(async tx=>{const v=await tx.vendor.findUniqueOrThrow({where:{id},include:{kyc:true}});if(d.status==='ACTIVE'&&!v.kyc) throw new BadRequestException('KYC is required before approval');
      await tx.vendor.update({where:{id},data:{status:d.status,commissionBps:d.commissionBps}});
      if(v.kyc) await tx.vendorKyc.update({where:{vendorId:id},data:{status:d.status,note:d.note,reviewedAt:new Date()}});
      if(d.status!=='ACTIVE') await tx.product.updateMany({where:{vendorId:id},data:{status:'DRAFT'}});
      return {ok:true};
    });
  }
  @Roles('PLATFORM_ADMIN') @Get('products') products() {return this.db.product.findMany({include:{vendor:{select:{storeName:true}},variants:true},orderBy:{createdAt:'desc'},take:200});}
  @Roles('PLATFORM_ADMIN') @Patch('products/:id') async moderate(@Param('id') id:string,@Body() b:unknown) {
    const d=input(z.object({status:z.enum(['ACTIVE','REJECTED','DRAFT']),featured:z.boolean().optional()}),b);const p=await this.db.product.findUniqueOrThrow({where:{id},include:{vendor:true}});if(d.status==='ACTIVE'&&p.vendor.status!=='ACTIVE') throw new BadRequestException('Vendor must be active');return this.db.product.update({where:{id},data:d});
  }
  @Get('orders') orders() {return this.db.order.findMany({include:{user:{select:{name:true,email:true}},payment:{select:{provider:true,status:true}},vendorOrders:{include:{lines:true,vendor:{select:{storeName:true}}}}},orderBy:{createdAt:'desc'},take:100});}
  @Get('returns') returns() {return this.db.returnRequest.findMany({include:{vendorOrder:{include:{lines:true,order:{select:{userId:true}},vendor:{select:{storeName:true}}}}},orderBy:{createdAt:'desc'}});}
  @Get('refunds') refunds() {return this.db.refund.findMany({orderBy:{createdAt:'desc'},take:100});}
  @Get('events') events() {return this.db.outboxEvent.findMany({where:{processedAt:null},orderBy:{createdAt:'desc'},take:100});}
}
