'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, ShieldCheck, Store, Truck } from 'lucide-react';
import { useStore } from '@/components/provider';
import { api, json } from '@/lib/api';
import { PageTitle } from '@/components/ui';
export default function Sell() {
  const { user, refresh } = useStore(),
    router = useRouter(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="container page">
      <PageTitle
        eyebrow="BUILD SOMETHING GOOD"
        title="Your store. A bigger story."
        description="Bring what makes your business special. We’ll help the right people find it."
      />
      <div className="sell-layout">
        <div>
          <div className="sell-points">
            {[
              [
                Store,
                'Your own little corner',
                'A dedicated storefront, product catalog, and tools to make running your store feel simple.',
              ],
              [
                ShieldCheck,
                'Trust comes first',
                'Verified seller onboarding and moderated listings help customers shop with confidence.',
              ],
              [
                Truck,
                'Orders, made manageable',
                'Each vendor gets a separate shipment and fulfillment workflow, even in a shared customer checkout.',
              ],
              [
                Heart,
                'Grow at your own pace',
                'A standard 10% platform commission. Vendor earnings become available after delivery.',
              ],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Store;
              return (
                <div key={String(title)}>
                  <I size={25} />
                  <span>
                    <h3>{String(title)}</h3>
                    <p>{String(text)}</p>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <section className="panel">
          <h2>Let’s open the door.</h2>
          {!user ? (
            <>
              <p>Sign in or create an account to start your seller application.</p>
              <Link className="button" style={{ marginTop: 22 }} href="/login?next=/sell">
                Get started →
              </Link>
            </>
          ) : user.role.startsWith('VENDOR') ? (
            <>
              <p>Your store is already part of Bazaar.</p>
              <Link className="button" style={{ marginTop: 22 }} href="/vendor">
                Go to your dashboard →
              </Link>
            </>
          ) : (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(
                    '/vendor/apply',
                    json(Object.fromEntries(new FormData(e.currentTarget))),
                  );
                  await refresh();
                  router.push('/vendor');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Store name
                <input
                  required
                  name="storeName"
                  minLength={3}
                  maxLength={100}
                  placeholder="Your wonderful little store"
                />
              </label>
              <label>
                Store URL
                <input
                  required
                  name="slug"
                  minLength={3}
                  maxLength={100}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="your-store-name"
                />
                <small>Lowercase letters, numbers and hyphens.</small>
              </label>
              <label>
                Your story
                <textarea
                  required
                  name="description"
                  maxLength={1000}
                  rows={4}
                  placeholder="What makes your store special?"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy ? 'Opening your store…' : 'Start your seller journey'}
              </button>
              <p className="fine-print">
                Next: submit KYC details for platform approval before publishing products.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
