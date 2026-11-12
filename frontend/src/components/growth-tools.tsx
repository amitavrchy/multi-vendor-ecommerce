'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Building2, Repeat2, Mail } from 'lucide-react';
import { useApi, api, json } from '@/lib/api';
import { money } from '@/lib/types';
import { useStore } from './provider';
export function ProductGrowthTools({ variantId }: { variantId: string }) {
  const { user, toast } = useStore(),
    tiers = useApi<{ minQty: number; unitPriceMinor: number }[]>(`/business/tiers/${variantId}`),
    [busy, setBusy] = useState(false);
  async function send(path: string, data: unknown) {
    if (!user) {
      toast('Sign in to use this shopping tool');
      return;
    }
    setBusy(true);
    try {
      await api(path, json(data));
      toast(
        path === '/subscriptions'
          ? 'Subscription saved. Manage it from your account.'
          : 'Quote requested. Track the offer in Business buying.',
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="growth-product-tools">
      <details>
        <summary>
          <Building2 size={18} />
          Business & wholesale
        </summary>
        <p>Verified businesses receive quantity pricing automatically at checkout.</p>
        {!!tiers.data?.length && (
          <table>
            <thead>
              <tr>
                <th>Quantity</th>
                <th>Unit price</th>
              </tr>
            </thead>
            <tbody>
              {tiers.data.map((t) => (
                <tr key={t.minQty}>
                  <td>{t.minQty}+ items</td>
                  <td>{money(t.unitPriceMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link href="/business" className="text-link">
          Apply or manage business quotes →
        </Link>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send('/business/quotes', {
              variantId,
              qty: Number(f.get('qty')),
              note: f.get('note'),
            });
          }}
        >
          <label>
            Request a bulk quote
            <input
              name="qty"
              type="number"
              min="2"
              max="999"
              defaultValue="10"
              aria-label="Quote quantity"
              required
            />
          </label>
          <label>
            Your requirements
            <textarea
              name="note"
              minLength={10}
              maxLength={1000}
              placeholder="Tell the seller about your order"
              required
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Request quote
          </button>
        </form>
      </details>
      <details>
        <summary>
          <Repeat2 size={18} />
          Keep the good things coming
        </summary>
        <p>
          Choose a replenishment schedule. Review current prices and approve each renewal at
          checkout. You won’t be charged automatically.
        </p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send('/subscriptions', {
              variantId,
              qty: Number(f.get('qty')),
              intervalDays: Number(f.get('intervalDays')),
              startNow: f.get('startNow') === 'on',
            });
          }}
        >
          <div className="form-row">
            <label>
              Quantity
              <input name="qty" type="number" min="1" max="99" defaultValue="1" required />
            </label>
            <label>
              Repeat every
              <select name="intervalDays" defaultValue="30">
                {[14, 30, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-line">
            <input type="checkbox" name="startNow" />
            Prepare the first renewal now
          </label>
          <button className="button secondary" disabled={busy}>
            Create subscription
          </button>
          <Link className="text-link" href="/subscriptions">
            Manage subscriptions →
          </Link>
        </form>
      </details>
    </div>
  );
}
export function NewsletterSignup() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  return (
    <section className="newsletter-signup">
      <div>
        <p className="eyebrow">
          <Mail size={17} />
          THE OCCASIONAL GOOD THING
        </p>
        <h2>A little discovery in your inbox.</h2>
        <p>
          New finds, independent stores and thoughtful offers. Only after you confirm. Unsubscribe
          any time.
        </p>
      </div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setError('');
          try {
            await api(
              '/marketing/subscribe',
              json({ email: new FormData(form).get('email'), consent: true }),
            );
            setMessage('Check your inbox to confirm your subscription.');
            form.reset();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email address
          <input name="email" type="email" placeholder="you@example.com" required maxLength={254} />
        </label>
        <label className="check-line">
          <input type="checkbox" required />
          I’d like curated finds and marketplace offers by email.
        </label>
        <button className="button" disabled={busy}>
          Keep me in the loop →
        </button>
        {message && (
          <p className="success-text" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
