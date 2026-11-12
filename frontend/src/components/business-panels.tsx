'use client';
import { useState } from 'react';
import { api, json, useApi } from '@/lib/api';
import { Product, money } from '@/lib/types';
import { useStore } from './provider';
import { Loading, ErrorBox, Badge } from './ui';
export function SellerBusinessPanel() {
  const products = useApi<Product[]>('/vendor/products'),
    quotes = useApi<
      {
        id: string;
        qty: number;
        note: string;
        status: string;
        user: { name: string; business: { legalName: string } | null };
        variant: { sku: string; priceMinor: number; product: { title: string } };
      }[]
    >('/business/seller/quotes');
  const { toast } = useStore(),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState('');
  const variantId = selected || products.data?.[0]?.variants[0]?.id;
  const tiers = useApi<{ minQty: number; unitPriceMinor: number }[]>(
    variantId ? `/business/tiers/${variantId}` : null,
  );
  async function act(path: string, data: unknown) {
    setBusy(true);
    try {
      await api(path, json(data));
      await Promise.all([quotes.refresh(), tiers.refresh()]);
      toast('Business tools updated');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel wholesale-panel">
        <h2>Wholesale quantity pricing</h2>
        <p>
          Only verified businesses receive these prices. Larger quantity thresholds must have lower
          prices. Retail customers keep retail pricing.
        </p>
        {products.error && <ErrorBox message={products.error} />}
        <label>
          Product variant
          <select
            aria-label="Wholesale variant"
            value={variantId || ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {products.data?.flatMap((p) =>
              p.variants.map((v) => (
                <option value={v.id} key={v.id}>
                  {p.title} · {v.sku}
                </option>
              )),
            )}
          </select>
        </label>
        <form
          className="form"
          key={`${variantId}:${JSON.stringify(tiers.data)}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!variantId) return;
            const f = new FormData(e.currentTarget);
            const values = [1, 2]
              .filter((i) => f.get(`qty${i}`) && f.get(`price${i}`))
              .map((i) => ({
                minQty: Number(f.get(`qty${i}`)),
                unitPriceMinor: Math.round(Number(f.get(`price${i}`)) * 100),
              }));
            void act(`/business/tiers/${variantId}`, { tiers: values });
          }}
        >
          {[1, 2].map((i) => (
            <div className="form-row" key={i}>
              <label>
                Tier {i} minimum quantity
                <input
                  name={`qty${i}`}
                  type="number"
                  min="2"
                  max="999"
                  defaultValue={tiers.data?.[i - 1]?.minQty}
                />
              </label>
              <label>
                Unit price (৳)
                <input
                  name={`price${i}`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={
                    tiers.data?.[i - 1] ? tiers.data[i - 1].unitPriceMinor / 100 : undefined
                  }
                />
              </label>
            </div>
          ))}
          <p className="muted">Leave both rows empty to remove quantity pricing.</p>
          <button className="button" disabled={busy || !variantId}>
            Save wholesale tiers
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Business quote requests</h2>
        {quotes.loading ? (
          <Loading />
        ) : quotes.error ? (
          <ErrorBox message={quotes.error} />
        ) : !quotes.data?.length ? (
          <p>No requests yet.</p>
        ) : (
          quotes.data.map((q) => (
            <article className="growth-record" key={q.id}>
              <div className="section-heading">
                <h3>{q.variant.product.title}</h3>
                <Badge status={q.status} />
              </div>
              <p>
                {q.user.business?.legalName || q.user.name} · {q.qty} × {q.variant.sku} · retail{' '}
                {money(q.variant.priceMinor)}
              </p>
              <p>{q.note}</p>
              {['REQUESTED', 'OFFERED'].includes(q.status) && (
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(`/business/seller/quotes/${q.id}/offer`, {
                      unitPriceMinor: Math.round(Number(f.get('price')) * 100),
                      expiresDays: Number(f.get('days')),
                      sellerNote: f.get('note'),
                    });
                  }}
                >
                  <div className="form-row">
                    <label>
                      Offer unit price (৳)
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={q.variant.priceMinor / 100}
                        required
                      />
                    </label>
                    <label>
                      Valid for (days)
                      <input name="days" type="number" min="1" max="14" defaultValue="7" required />
                    </label>
                  </div>
                  <label>
                    Offer note
                    <textarea name="note" minLength={5} maxLength={1000} required />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Send offer
                  </button>
                </form>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}
export function AdminBusinessPanel() {
  const data = useApi<
      {
        userId: string;
        legalName: string;
        registrationNumber: string;
        billingAddress: string;
        status: string;
        user: { email: string; name: string };
      }[]
    >('/business/admin/applications'),
    { toast } = useStore(),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Business verification</h2>
      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox message={data.error} />
      ) : (
        data.data?.map((b) => (
          <article key={b.userId} className="growth-record">
            <div className="section-heading">
              <h3>{b.legalName}</h3>
              <Badge status={b.status} />
            </div>
            <p>
              {b.user.name} · {b.user.email}
            </p>
            <p>
              Registration: {b.registrationNumber}
              <br />
              {b.billingAddress}
            </p>
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  await api(
                    `/business/admin/applications/${b.userId}`,
                    json({ status: f.get('status'), reviewNote: f.get('note') }, 'PATCH'),
                  );
                  await data.refresh();
                  toast('Business verification saved');
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Decision
                <select name="status" defaultValue="APPROVED">
                  <option value="APPROVED">Approve business</option>
                  <option value="REJECTED">Reject business</option>
                </select>
              </label>
              <label>
                Review note
                <input name="note" minLength={5} maxLength={1000} required />
              </label>
              <button className="button secondary" disabled={busy}>
                Save decision
              </button>
            </form>
          </article>
        ))
      )}
      {!data.loading && !data.data?.length && <p>No applications yet.</p>}
    </section>
  );
}
