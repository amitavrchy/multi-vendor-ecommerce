import { BadRequestException } from '@nestjs/common';
import { CreateIntentInput, PaymentProvider } from '../provider';
export class CodProvider implements PaymentProvider {
  code='COD'; supportsPartialRefund=true; available=true;
  async createIntent(i:CreateIntentInput) { return {providerRef:`cod_${i.orderId}`,status:'COD_PENDING' as const,instructions:'Pay cash to your delivery partner. Refunds are recorded for manual bank/mobile transfer.'}; }
  async parseWebhook():Promise<never> { throw new BadRequestException('Cash on delivery does not accept payment webhooks'); }
  async refund(ref:string,_amount:number,key:string) { return {providerRef:`manual_${ref}_${key}`,status:'PENDING' as const}; }
}
