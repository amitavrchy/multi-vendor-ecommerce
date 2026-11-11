import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { Public } from './auth/access';
import { input } from './common/input';
export const productInclude = {vendor:{select:{id:true,storeName:true,slug:true}},category:true,variants:true,reviews:{select:{rating:true}}} satisfies Prisma.ProductInclude;
@Public() @Controller()
export class CatalogController {
  constructor(private db:Db) {}
  @Get('categories') categories() { return this.db.category.findMany({include:{_count:{select:{products:{where:{status:'ACTIVE',vendor:{status:'ACTIVE'}}}}}}}); }
  @Get('search') search(@Query() query:unknown) { return this.products(query); }
  @Get('products') async products(@Query() query:unknown) {
    const q = input(z.object({q:z.string().max(100).optional(),category:z.string().optional(),vendor:z.string().optional(),sort:z.enum(['featured','newest','price-asc','price-desc','rating']).default('featured'),page:z.coerce.number().int().min(1).max(1000).default(1),limit:z.coerce.number().int().min(1).max(60).default(12),min:z.coerce.number().min(0).optional(),max:z.coerce.number().min(0).optional(),inStock:z.enum(['true','false']).optional()}),query);
    const price:Prisma.IntFilter = {...(q.min!==undefined?{gte:Math.round(q.min*100)}:{}),...(q.max!==undefined?{lte:Math.round(q.max*100)}:{})};
    const where:Prisma.ProductWhereInput = {status:'ACTIVE',vendor:{status:'ACTIVE',...(q.vendor?{slug:q.vendor}:{})},...(q.category?{categoryId:q.category}:{}),...(q.q?{OR:[{title:{contains:q.q,mode:'insensitive'}},{description:{contains:q.q,mode:'insensitive'}},{vendor:{storeName:{contains:q.q,mode:'insensitive'}}}]}:{}),variants:{some:{priceMinor:price,...(q.inStock==='true'?{stockQty:{gt:0}}:{})}}};
    // Bounded catalog sorting includes variant price and review aggregates.
    const products = await this.db.product.findMany({where,include:productInclude,orderBy:q.sort==='newest'?{createdAt:'desc'}:[{featured:'desc'},{createdAt:'desc'}],take:10000});
    const minPrice=(p:typeof products[number])=>Math.min(...p.variants.map(v=>v.priceMinor));
    if (q.sort.startsWith('price')) products.sort((a,b)=>(minPrice(a)-minPrice(b))*(q.sort==='price-asc'?1:-1));
    if(q.sort==='rating') { const avg=(p:typeof products[number])=>p.reviews.reduce((s,r)=>s+r.rating,0)/(p.reviews.length||1); products.sort((a,b)=>avg(b)-avg(a)); }
    return {items:products.slice((q.page-1)*q.limit,q.page*q.limit),total:products.length,page:q.page,pages:Math.ceil(products.length/q.limit)};
  }
  @Get('products/:slug') async detail(@Param('slug') slug:string) {
    const p=await this.db.product.findFirst({where:{slug,status:'ACTIVE',vendor:{status:'ACTIVE'}},include:{...productInclude,reviews:{include:{user:{select:{name:true}}},orderBy:{createdAt:'desc'}}}});
    if(!p) throw new NotFoundException('Product not found'); return p;
  }
  @Get('vendors') vendors() { return this.db.vendor.findMany({where:{status:'ACTIVE'},select:{id:true,slug:true,storeName:true,description:true,_count:{select:{products:{where:{status:'ACTIVE'}}}}}}); }
  @Get('vendors/:slug') async vendor(@Param('slug') slug:string) { const v=await this.db.vendor.findFirst({where:{slug,status:'ACTIVE'},select:{id:true,slug:true,storeName:true,description:true,createdAt:true}}); if(!v) throw new NotFoundException(); return v; }
}
