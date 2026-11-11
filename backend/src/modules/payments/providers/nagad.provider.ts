import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentProvider } from '../provider';
export class NagadProvider implements PaymentProvider {
  code='NAGAD'; supportsPartialRefund=false; available=false;
  async createIntent():Promise<never> { throw new ServiceUnavailableException('Nagad merchant integration is not enabled'); }
  async parseWebhook():Promise<never> { throw new ServiceUnavailableException('Nagad callback verification is not enabled'); }
  async refund():Promise<never> { throw new ServiceUnavailableException('Nagad refunds are not enabled'); }
}
