import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CreateIntentInput, PaymentProvider } from '../provider';
export class SslCommerzProvider implements PaymentProvider {
  code='SSLCOMMERZ'; supportsPartialRefund=true;
  available=!!(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD);
  private base=process.env.SSLCOMMERZ_IS_LIVE==='true'?'https://securepay.sslcommerz.com':'https://sandbox.sslcommerz.com';
  private credentials() { if(!this.available) throw new ServiceUnavailableException('SSLCommerz is not configured'); return {store_id:process.env.SSLCOMMERZ_STORE_ID!,store_passwd:process.env.SSLCOMMERZ_STORE_PASSWORD!}; }
  async createIntent(i:CreateIntentInput) {
    const url=process.env.APP_URL!;
    const form=new URLSearchParams({...this.credentials(),total_amount:(i.amountMinor/100).toFixed(2),currency:i.currency,tran_id:i.orderId,success_url:`${url}/orders`,fail_url:`${url}/orders`,cancel_url:`${url}/orders`,ipn_url:`${url}/api/payments/webhooks/SSLCOMMERZ`,cus_name:'Bazaar customer',cus_email:i.email,cus_add1:'Bangladesh',cus_city:'Dhaka',cus_country:'Bangladesh',cus_phone:'01700000000',shipping_method:'NO',product_name:'Marketplace order',product_category:'General',product_profile:'general'});
    const r=await fetch(`${this.base}/gwprocess/v4/api.php`,{method:'POST',body:form,signal:AbortSignal.timeout(15000)}); const d=await r.json();
    if(!r.ok || d.status!=='SUCCESS' || !d.GatewayPageURL) throw new ServiceUnavailableException('Payment gateway did not start this session');
    return {providerRef:i.orderId,redirectUrl:d.GatewayPageURL as string,status:'REQUIRES_ACTION' as const};
  }
  async parseWebhook(_raw:Buffer,_headers:Record<string,unknown>,body:unknown) {
    const b=body as Record<string,string>; if(!b.val_id) throw new BadRequestException('Missing validation reference');
    const query=new URLSearchParams({...this.credentials(),val_id:b.val_id,format:'json'});
    const r=await fetch(`${this.base}/validator/api/validationserverAPI.php?${query}`,{signal:AbortSignal.timeout(15000)}); const d=await r.json();
    if(!r.ok || !['VALID','VALIDATED'].includes(d.status) || d.tran_id!==b.tran_id || d.currency!=='BDT' || d.store_id!==process.env.SSLCOMMERZ_STORE_ID) throw new BadRequestException('Gateway validation failed');
    return {eventId:d.val_id as string,providerRef:d.tran_id as string,status:'SUCCEEDED' as const,amountMinor:Math.round(Number(d.amount)*100)};
  }
  async refund(ref:string,amountMinor:number,key:string) {
    const q=new URLSearchParams({...this.credentials(),bank_tran_id:ref,refund_amount:(amountMinor/100).toFixed(2),refund_remarks:key,format:'json'});
    // SSL refunds require a bank transaction ID, not the merchant tran_id used as our payment reference.
    throw new ServiceUnavailableException(`SSLCommerz refunds require operator reconciliation; no refund has been recorded as paid (${q.get('refund_remarks')})`);
  }
}
