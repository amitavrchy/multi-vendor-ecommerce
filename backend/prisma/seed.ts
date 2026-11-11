import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { catalog,categories } from './catalog';
const db=new PrismaClient();
async function main(){
  if(process.env.NODE_ENV==='production')throw new Error('Demo seed is disabled in production');
  if(!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length<10)throw new Error('Set SEED_PASSWORD (10+ characters)');
  const passwordHash=await hash(process.env.SEED_PASSWORD,12);
  const accounts=[['admin@bazaar.test','Platform Admin','PLATFORM_ADMIN'],['customer@bazaar.test','Alex Morgan','CUSTOMER'],['owner@form.test','Maya Rahman','VENDOR_OWNER'],['owner@sound.test','Arif Hasan','VENDOR_OWNER'],['owner@everyday.test','Nadia Islam','VENDOR_OWNER'],['support@bazaar.test','Support Team','SUPPORT_AGENT']];
  for(const [email,name,role]of accounts)await db.user.upsert({where:{email},create:{email,name,role,passwordHash},update:{passwordHash}});
  for(const c of categories)await db.category.upsert({where:{id:c.id},create:c,update:c});
  const stores=[['form-and-field','Form & Field','Thoughtful objects for a slower, more beautiful home.','owner@form.test'],['sound-studio','Sound Studio','Everyday technology. Exceptionally considered.','owner@sound.test'],['the-everyday-co','The Everyday Co.','Well-made essentials that go everywhere with you.','owner@everyday.test']];
  for(const [slug,storeName,description,email]of stores){
    const owner=await db.user.findUniqueOrThrow({where:{email}});
    await db.vendor.upsert({where:{slug},create:{id:slug,slug,storeName,description,ownerId:owner.id,status:'ACTIVE',balance:{create:{}},kyc:{create:{documents:{legalName:storeName,tradeLicense:'DEMO-VERIFIED'},status:'ACTIVE',reviewedAt:new Date()}}},update:{}});
  }
  for(let i=0;i<catalog.length;i++){
    const [title,categoryId,price,compare,,store]=catalog[i];const slug=title.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-');
    await db.product.upsert({where:{slug},update:{},create:{id:`product-${i+1}`,slug,title,description:`Meet your new everyday favourite. ${title} brings considered design and dependable quality to your daily routine. Carefully selected by ${stores[store][1]}, with quality materials, a thoughtful finish, and details that make a difference. Ships from Bangladesh in 2–4 working days. Includes our 14-day return promise.`,image:`/products/${String(i+1).padStart(2,'0')}.jpg`,categoryId,vendorId:stores[store][0],status:'ACTIVE',featured:i<8,variants:{create:{id:`variant-${i+1}`,sku:`BZR-${String(i+1).padStart(4,'0')}`,priceMinor:price*100,compareAtMinor:compare*100,stockQty:50,attrs:{Color:'Original',Material:'Premium finish'}}}}});
  }
  await db.coupon.upsert({where:{code:'WELCOME10'},create:{code:'WELCOME10',percent:10,maxDiscountMinor:100000,minGoodsMinor:100000,expiresAt:new Date('2030-12-31')},update:{}});
  const customer=await db.user.findUniqueOrThrow({where:{email:'customer@bazaar.test'}});
  if(!await db.address.count({where:{userId:customer.id}}))await db.address.create({data:{userId:customer.id,label:'Home',name:'Alex Morgan',phone:'+8801700000000',line1:'House 12, Road 7, Dhanmondi',city:'Dhaka',postalCode:'1209'}});
  console.log('Seeded 3 verified stores, 30 products, WELCOME10 and 6 demo accounts.');
}
main().finally(()=>db.$disconnect());
