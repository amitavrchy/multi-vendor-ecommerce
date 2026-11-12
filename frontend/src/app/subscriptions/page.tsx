'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, json, useApi } from '@/lib/api';
import { money } from '@/lib/types';
import { Gate } from '@/components/gate';
import { ProductImage } from '@/components/product-image';
import { useStore } from '@/components/provider';
import { PageTitle, Loading, ErrorBox, Badge, Empty } from '@/components/ui';
type Plan = {
  id: string;
  status: string;
  qty: number;
  intervalDays: number;
  nextAt: string;
  variant: {
    sku: string;
    priceMinor: number;
    product: { title: string; image: string; slug: string };
  };
  renewals: { id: string; cycle: number; status: string; dueAt: string; orderId: string | null }[];
};
function Subscriptions() {
  const list = useApi<Plan[]>('/subscriptions'),
    { toast } = useStore(),
    [busy, setBusy] = useState(false);
  async function act(path: string, value: unknown, method = 'POST') {
    setBusy(true);
    try {
      await api(path, json(value, method));
      await list.refresh();
      toast('Subscription updated');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <PageTitle
        eyebrow="GOOD THINGS, ON YOUR SCHEDULE"
        title="Your everyday, replenished."
        description="Pause, skip or cancel at any time. Each renewal needs your approval and payment at the current price; there are no automatic charges."
        action={
          <Link className="button secondary" href="/shop">
            Find something to repeat →
          </Link>
        }
      />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox message={list.error} />
      ) : !list.data?.length ? (
        <Empty
          title="Make a good find a regular thing"
          text="Create a replenishment schedule from any product page."
        />
      ) : (
        list.data.map((s) => (
          <section className="panel" key={s.id}>
            <div className="subscription-header">
              <ProductImage src={s.variant.product.image} alt={s.variant.product.title} />
              <div>
                <Link href={`/product/${s.variant.product.slug}`}>
                  <h2>{s.variant.product.title}</h2>
                </Link>
                <p>
                  {s.qty} × {s.variant.sku} every {s.intervalDays} days · current unit price{' '}
                  {money(s.variant.priceMinor)}
                </p>
                <Badge status={s.status} />
                {s.status === 'ACTIVE' && (
                  <p>Next scheduled review: {new Date(s.nextAt).toLocaleString()}</p>
                )}
              </div>
            </div>
            <div className="growth-actions">
              {s.status === 'ACTIVE' && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void act(`/subscriptions/${s.id}`, { status: 'PAUSED' }, 'PATCH')}
                >
                  Pause
                </button>
              )}
              {s.status === 'PAUSED' && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void act(`/subscriptions/${s.id}`, { status: 'ACTIVE' }, 'PATCH')}
                >
                  Resume
                </button>
              )}
              {s.status !== 'CANCELLED' && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void act(`/subscriptions/${s.id}`, { status: 'CANCELLED' }, 'PATCH')
                  }
                >
                  Cancel subscription
                </button>
              )}
            </div>
            {s.renewals.map((r) => (
              <div className="growth-record" key={r.id}>
                <div className="section-heading">
                  <strong>
                    Renewal {r.cycle} · {new Date(r.dueAt).toLocaleDateString()}
                  </strong>
                  <Badge status={r.status} />
                </div>
                <div className="growth-actions">
                  {r.status === 'DUE' && s.status !== 'CANCELLED' && (
                    <>
                      <Link className="button" href={`/checkout?renewal=${r.id}`}>
                        Review & checkout renewal →
                      </Link>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => void act(`/subscriptions/renewals/${r.id}/skip`, {})}
                      >
                        Skip this renewal
                      </button>
                    </>
                  )}
                  {r.orderId && (
                    <Link href="/orders" className="text-link">
                      Track order →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
export default function Page() {
  return (
    <Gate>
      <Subscriptions />
    </Gate>
  );
}
