import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal, Roles } from './auth/access';
import { input, slugSchema } from './common/input';
import { VendorScope } from './vendor-scope.service';
const productSchema=z.object({title:z.string().min(3).max(180),slug:slugSchema,description:z.string().min(20).max(10000),categoryId:z.string(),image:z.string().refine(v=>v.startsWith('/products/')||v.startsWith('https://'),'Use HTTPS or a product asset'),priceMinor:z.number().int().min(100).max(100000000),compareAtMinor:z.number().int().positive().optional(),stockQty:z.number().int().min(0).max(100000),sku:z.string().min(3).max(100)});
@Roles('VENDOR_OWNER','VENDOR_STAFF') @Controller('vendor/products')
export class VendorCatalogController {
  constructor(private db:Db,private scope:VendorScope) {}
  @Get() async list(@Actor() u:Principal) { const v=await this.scope.get(u); return this.db.product.findMany({where:{vendorId:v.id},include:{variants:true,category:true},orderBy:{createdAt:'desc'}}); }
  @Roles('VENDOR_OWNER') @Post() async create(@Actor() u:Principal,@Body() b:unknown) {
    const d=input(productSchema,b); const v=await this.scope.get(u,true); if(v.status!=='ACTIVE') throw new BadRequestException('Your store must be verified first');
    const {priceMinor,compareAtMinor,stockQty,sku,...product}=d; return this.db.product.create({data:{...product,vendorId:v.id,status:'DRAFT',variants:{create:{priceMinor,compareAtMinor,stockQty,sku,attrs:{}}}},include:{variants:true}});
  }
  @Patch(':id/inventory') async inventory(@Actor() u:Principal,@Param('id') id:string,@Body() b:unknown) {
    const d=input(z.object({stockQty:z.number().int().min(0).max(100000)}),b); const v=await this.scope.get(u);
    return this.db.atomic(async tx=>{const variant=await tx.productVariant.findFirst({where:{id,product:{vendorId:v.id}}}); if(!variant) throw new NotFoundException(); if(d.stockQty<variant.reservedQty) throw new BadRequestException('Stock cannot be lower than reserved quantity');return tx.productVariant.update({where:{id},data:d});});
  }
  @Roles('VENDOR_OWNER') @Patch(':id') async edit(@Actor() u:Principal,@Param('id') id:string,@Body() b:unknown) {
    const d=input(productSchema.partial().omit({sku:true,stockQty:true}),b); const v=await this.scope.get(u,true);
    return this.db.atomic(async tx=>{const p=await tx.product.findFirst({where:{id,vendorId:v.id},include:{variants:true}}); if(!p) throw new NotFoundException();const {priceMinor,compareAtMinor,...product}=d;
      if(priceMinor!==undefined||compareAtMinor!==undefined) await tx.productVariant.update({where:{id:p.variants[0].id},data:{priceMinor,compareAtMinor}});
      return tx.product.update({where:{id},data:{...product,status:'DRAFT'}});
    });
  }
}
