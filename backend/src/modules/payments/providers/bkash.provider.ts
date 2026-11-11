import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentProvider } from '../provider';
// Deliberately unavailable until merchant callback/execute reconciliation is configured and certified.
export class BkashProvider implements PaymentProvider {
  code = 'BKASH';
  supportsPartialRefund = true;
  available = false;
  async createIntent(): Promise<never> {
    throw new ServiceUnavailableException('bKash merchant integration is not enabled');
  }
  async parseWebhook(): Promise<never> {
    throw new ServiceUnavailableException('bKash callback verification is not enabled');
  }
  async refund(): Promise<never> {
    throw new ServiceUnavailableException('bKash refunds are not enabled');
  }
}
