import { Injectable, BadRequestException } from '@nestjs/common';
import { PaymentProvider } from './provider';
import { CodProvider } from './providers/cod.provider';
import { StripeProvider } from './providers/stripe.provider';
import { SslCommerzProvider } from './providers/sslcommerz.provider';
import { BkashProvider } from './providers/bkash.provider';
import { NagadProvider } from './providers/nagad.provider';
@Injectable()
export class ProviderRegistry {
  private providers=new Map<string,PaymentProvider>();
  constructor() { [new CodProvider(),new StripeProvider(),new SslCommerzProvider(),new BkashProvider(),new NagadProvider()].forEach(p=>this.register(p)); }
  register(provider:PaymentProvider) { this.providers.set(provider.code,provider); }
  get(code:string) { const provider=this.providers.get(code); if(!provider || !provider.available) throw new BadRequestException('This payment method is not available'); return provider; }
  list() { return [...this.providers.values()].map(p=>({code:p.code,available:p.available,supportsPartialRefund:p.supportsPartialRefund})); }
}
