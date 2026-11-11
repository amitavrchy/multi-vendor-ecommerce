export const fulfillment: Record<string, readonly string[]> = {
  AWAITING_FULFILLMENT: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  PENDING_PAYMENT: [],
};
export function masterStatus(statuses: string[]) {
  if (statuses.every((s) => s === 'CANCELLED')) return 'CANCELLED';
  if (statuses.every((s) => ['DELIVERED', 'CANCELLED'].includes(s))) return 'FULFILLED';
  if (statuses.some((s) => ['SHIPPED', 'DELIVERED'].includes(s))) return 'PARTIALLY_FULFILLED';
  return 'PAID';
}
