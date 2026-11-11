import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { Actor, Principal } from './auth/access';
import { addressSchema, input } from './common/input';
@Controller('profile')
export class ProfileController {
  constructor(private db:Db) {}
  @Patch() update(@Actor() u:Principal,@Body() b:unknown) { return this.db.user.update({where:{id:u.id},data:input(z.object({name:z.string().trim().min(2).max(80)}),b),select:{id:true,name:true,email:true,role:true}}); }
  @Get('addresses') addresses(@Actor() u:Principal) { return this.db.address.findMany({where:{userId:u.id}}); }
  @Post('addresses') add(@Actor() u:Principal,@Body() b:unknown) { return this.db.address.create({data:{...input(addressSchema,b),userId:u.id}}); }
  @Delete('addresses/:id') async remove(@Actor() u:Principal,@Param('id') id:string) { const r=await this.db.address.deleteMany({where:{id,userId:u.id}}); if (!r.count) throw new NotFoundException(); return {ok:true}; }
  @Get('notifications') notifications(@Actor() u:Principal) { return this.db.notification.findMany({where:{userId:u.id},orderBy:{createdAt:'desc'},take:50}); }
  @Patch('notifications/read') async read(@Actor() u:Principal) { await this.db.notification.updateMany({where:{userId:u.id,read:false},data:{read:true}}); return {ok:true}; }
}
