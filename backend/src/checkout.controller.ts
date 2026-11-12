import { All, Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { config } from './config';
import { z } from 'zod';
import { Actor, Principal, Public } from './auth/access';
import { input } from './common/input';
import { CheckoutService } from './checkout.service';
import { ProviderRegistry } from './modules/payments/registry';
@Controller()
export class CheckoutController {
  constructor(
    private checkout: CheckoutService,
    private providers: ProviderRegistry,
  ) {}
  @Public() @Get('payments/providers') methods() {
    return this.providers.list();
  }
  @Public() @All('payments/return') browserReturn(@Res() res: Response) {
    // A browser return is navigation only. The verified IPN settles payment.
    return res.redirect(303, `${config.APP_URL}/orders`);
  }
  @Post('checkout/session') session(
    @Actor() user: Principal,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const d = input(
      z.object({
        addressId: z.string(),
        provider: z.string(),
        couponCode: z.string().max(40).optional(),
        quoteId: z.string().max(100).optional(),
        renewalId: z.string().max(100).optional(),
      }),
      body,
    );
    return this.checkout.start(user, d, input(z.string().min(16).max(100), key));
  }
  @Post('checkout/preview') preview(@Actor() user: Principal, @Body() body: unknown) {
    const data = input(
      z.object({
        couponCode: z.string().max(40).optional(),
        quoteId: z.string().max(100).optional(),
        renewalId: z.string().max(100).optional(),
      }),
      body,
    );
    return this.checkout.preview(user, data);
  }
}
