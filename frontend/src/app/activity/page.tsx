'use client';
import Link from 'next/link';
import { Bell, Trash2 } from 'lucide-react';
import { useApi, api } from '@/lib/api';
import { money } from '@/lib/types';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { Empty, Loading, ErrorBox, PageTitle } from '@/components/ui';
function Activity() {
  const { toast } = useStore();
  const alerts = useApi<
    {
      id: string;
      kind: string;
      targetMinor: number | null;
      active: boolean;
      triggeredAt: string | null;
      variant: {
        priceMinor: number;
        sku: string;
        product: { title: string; slug: string; image: string };
      };
    }[]
  >('/discovery/alerts');
  const following =
    useApi<
      { vendorId: string; vendor: { slug: string; storeName: string; description: string } }[]
    >('/discovery/following');
  async function remove(path: string) {
    try {
      await api(path, { method: 'DELETE' });
      await Promise.all([alerts.refresh(), following.refresh()]);
      toast('Your preferences are updated');
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <div className="container page">
      <PageTitle
        eyebrow="WE’LL KEEP AN EYE ON IT"
        title="Your shopping radar."
        description="Price drops, restocks and stores you love. Your preferences stay with your account."
      />
      {alerts.error && <ErrorBox message={alerts.error} />}
      <section className="panel">
        <h2>
          <Bell size={22} />
          Price & stock alerts
        </h2>
        {alerts.loading ? (
          <Loading />
        ) : alerts.data?.length ? (
          <div className="radar-list">
            {alerts.data.map((a) => (
              <article key={a.id}>
                <img src={a.variant.product.image} alt="" />
                <div>
                  <Link href={`/product/${a.variant.product.slug}`}>
                    <h3>{a.variant.product.title}</h3>
                  </Link>
                  <p>
                    {a.kind === 'PRICE'
                      ? `Target: ${money(a.targetMinor!)}`
                      : 'Notify when stock returns'}{' '}
                    · {a.variant.sku}
                  </p>
                  <span className={`status-pill ${a.active ? '' : 'complete'}`}>
                    {a.active
                      ? 'Watching'
                      : `Notification sent ${a.triggeredAt ? new Date(a.triggeredAt).toLocaleDateString() : ''}`}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Delete alert for ${a.variant.product.title}`}
                  onClick={() => void remove(`/discovery/alerts/${a.id}`)}
                >
                  <Trash2 size={19} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Let your next find come to you"
            text="Set a price target or a restock alert from any product page."
          />
        )}
      </section>
      <section className="panel">
        <h2>Stores you follow</h2>
        {following.error ? (
          <ErrorBox message={following.error} />
        ) : following.data?.length ? (
          <div className="followed-grid">
            {following.data.map((f) => (
              <article key={f.vendorId}>
                <h3>
                  <Link href={`/shop?vendor=${f.vendor.slug}`}>{f.vendor.storeName} ↗</Link>
                </h3>
                <p>{f.vendor.description}</p>
                <button
                  className="text-link"
                  onClick={() => void remove(`/discovery/following/${f.vendorId}`)}
                >
                  Unfollow store
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            Follow independent stores from{' '}
            <Link href="/stores" className="text-link">
              the store directory →
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
export default function Page() {
  return (
    <Gate>
      <Activity />
    </Gate>
  );
}
