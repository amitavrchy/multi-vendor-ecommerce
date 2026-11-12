'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, json, useApi } from '@/lib/api';
import { money } from '@/lib/types';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { PageTitle, Loading, ErrorBox, Badge } from '@/components/ui';
type Business = {
  profile: {
    legalName: string;
    registrationNumber: string;
    billingAddress: string;
    status: string;
    reviewNote: string | null;
  } | null;
  quotes: {
    id: string;
    qty: number;
    status: string;
    unitPriceMinor: number | null;
    expiresAt: string | null;
    sellerNote: string | null;
    orderId: string | null;
    variant: {
      sku: string;
      product: { title: string; slug: string; vendor: { storeName: string } };
    };
  }[];
};
function Business() {
  const data = useApi<Business>('/business/me'),
    { toast } = useStore(),
    [busy, setBusy] = useState(false);
  async function act(path: string, value: unknown) {
    setBusy(true);
    try {
      await api(path, json(value));
      await data.refresh();
      toast('Business account updated');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <PageTitle
        eyebrow="BETTER TOGETHER. BETTER IN QUANTITY."
        title="Business buying, thoughtfully."
        description="Verify your business, unlock quantity prices and negotiate directly with independent stores."
      />
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox message={data.error} />
      ) : (
        <div className="growth-columns">
          <section className="panel">
            <h2>Your business account</h2>
            {data.data?.profile && (
              <>
                <Badge status={data.data.profile.status} />
                <p>{data.data.profile.reviewNote}</p>
              </>
            )}
            <form
              className="form"
              key={data.data?.profile?.status}
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                void act('/business/apply', f);
              }}
            >
              <label>
                Legal business name
                <input
                  name="legalName"
                  defaultValue={data.data?.profile?.legalName}
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Registration number
                <input
                  name="registrationNumber"
                  defaultValue={data.data?.profile?.registrationNumber}
                  minLength={4}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Billing address
                <textarea
                  name="billingAddress"
                  defaultValue={data.data?.profile?.billingAddress}
                  minLength={10}
                  maxLength={500}
                  required
                />
              </label>
              <p className="muted">Updating these details sends the account back for review.</p>
              <button className="button" disabled={busy}>
                Submit for verification
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Your negotiated quotes</h2>
            <p className="muted">
              Request a quote from a product’s Business & wholesale section. Offers require approval
              before checkout.
            </p>
            {data.data?.quotes.map((q) => (
              <article className="growth-record" key={q.id}>
                <div className="section-heading">
                  <h3>{q.variant.product.title}</h3>
                  <Badge status={q.status} />
                </div>
                <p>
                  {q.qty} × {q.variant.sku} · {q.variant.product.vendor.storeName}
                </p>
                {q.unitPriceMinor !== null && (
                  <strong>
                    {money(q.unitPriceMinor)} per item · {money(q.unitPriceMinor * q.qty)} total
                    before shipping
                  </strong>
                )}
                <p>{q.sellerNote}</p>
                {q.expiresAt && (
                  <p className="muted">Offer expires {new Date(q.expiresAt).toLocaleString()}</p>
                )}
                <div className="growth-actions">
                  {q.status === 'OFFERED' && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(`/business/quotes/${q.id}/decision`, { accept: true })
                      }
                    >
                      Accept offer
                    </button>
                  )}
                  {q.status === 'ACCEPTED' && (
                    <Link className="button" href={`/checkout?quote=${q.id}`}>
                      Checkout quote →
                    </Link>
                  )}
                  {['REQUESTED', 'OFFERED', 'ACCEPTED'].includes(q.status) && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        void act(`/business/quotes/${q.id}/decision`, { accept: false })
                      }
                    >
                      Decline
                    </button>
                  )}
                  {q.orderId && (
                    <Link className="text-link" href="/orders">
                      View order →
                    </Link>
                  )}
                </div>
              </article>
            ))}
            {!data.data?.quotes.length && <p>No quote requests yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
export default function Page() {
  return (
    <Gate>
      <Business />
    </Gate>
  );
}
