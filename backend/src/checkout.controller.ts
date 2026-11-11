import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { z } from 'zod';
import { Actor, Principal, Public } from './auth/access';
import { input } from './common/input';
import { CheckoutService } from './checkout.service';
import { ProviderRegistry } from './modules/payments/registry';
@Controller()
export class CheckoutController {
  constructor(private checkout:CheckoutService,private providers:ProviderRegistry) {}
  @Public() @Get('payments/providers') methods() { return this.providers.list(); }
  @Post('checkout/session') session(@Actor() user:Principal,@Body() body:unknown,@Headers('idempotency-key') key:string) {
    const d=input(z.object({addressId:z.string(),provider:z.string(),couponCode:z.string().max(40).optional()}),body);
    return this.checkout.start(user,d,input(z.string().min(16).max(100),key));
  }
}
