'use client';
import { useApi } from '@/lib/api';
export function PolicyNotice() {
  const { data } = useApi<{ returnWindowDays: number; restockingBps: number }>('/policies');
  return (
    <p>
      Request eligible returns within {data?.returnWindowDays ?? 14} days of delivery. Select
      individual items and quantities from your orders.{' '}
      {data?.restockingBps
        ? `A ${data.restockingBps / 100}% restocking fee applies.`
        : 'No restocking fee applies.'}{' '}
      Original shipping is non-refundable.
    </p>
  );
}
