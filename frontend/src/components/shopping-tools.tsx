'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, Check, GitCompareArrows, Heart, TrendingDown } from 'lucide-react';
import { api, json, useApi } from '@/lib/api';
import { Product, money } from '@/lib/types';
import { useStore } from './provider';

export function CompareButton({ id }: { id: string }) {
  const { comparison, toggleCompare } = useStore();
  return (
    <button
      type="button"
      className={`compare-button ${comparison.includes(id) ? 'selected' : ''}`}
      aria-label={`${comparison.includes(id) ? 'Remove from' : 'Add to'} comparison`}
      aria-pressed={comparison.includes(id)}
      onClick={() => toggleCompare(id)}
    >
      <GitCompareArrows size={17} />
      <span>{comparison.includes(id) ? 'Comparing' : 'Compare'}</span>
    </button>
  );
}
export function CompareDock() {
  const { comparison } = useStore();
  if (!comparison.length) return null;
  return (
    <Link className="compare-dock" href="/compare">
      <GitCompareArrows size={20} />
      <span>
        Compare your finds <b>{comparison.length}/4</b>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
export function FollowButton({ vendorId }: { vendorId: string }) {
  const { user, toast } = useStore();
  const following = useApi<{ vendorId: string }[]>(user ? '/discovery/following' : null);
  const saved = following.data?.some((f) => f.vendorId === vendorId),
    [busy, setBusy] = useState(false);
  return (
    <button
      className="button secondary"
      disabled={busy}
      onClick={async () => {
        if (!user) {
          toast('Sign in to follow your favourite stores');
          return;
        }
        setBusy(true);
        try {
          await api(`/discovery/following/${vendorId}`, saved ? { method: 'DELETE' } : json({}));
          await following.refresh();
          toast(saved ? 'Store unfollowed' : 'Following this store');
        } catch (e) {
          toast((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
      {saved ? 'Following' : 'Follow store'}
    </button>
  );
}
export function ProductIntelligence({
  product,
  variantId,
}: {
  product: Product;
  variantId: string;
}) {
  const { user, toast } = useStore();
  const prices = useApi<{
    currentMinor: number;
    points: { priceMinor: number; recordedAt: string }[];
  }>(`/discovery/prices/${variantId}`);
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState('');
  const variant = product.variants.find((v) => v.id === variantId)!;
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('bazaar-recent') || '[]');
      const ids = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
      localStorage.setItem(
        'bazaar-recent',
        JSON.stringify([product.id, ...ids.filter((x) => x !== product.id)].slice(0, 12)),
      );
    } catch {
      /* optional browsing history */
    }
  }, [product.id]);
  const points = prices.data?.points || [];
  const lo = Math.min(...points.map((p) => p.priceMinor), variant.priceMinor),
    hi = Math.max(...points.map((p) => p.priceMinor), variant.priceMinor);
  async function watch(kind: 'PRICE' | 'STOCK', targetMinor?: number) {
    if (!user) {
      toast('Sign in to receive price and stock alerts');
      return;
    }
    setBusy(true);
    try {
      await api('/discovery/alerts', json({ variantId, kind, targetMinor }));
      setDone(kind);
      toast('Alert saved. We’ll notify you when it is available.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="intelligence-panel" aria-label="Shopping tools">
      <div className="intelligence-heading">
        <TrendingDown size={20} />
        <h3>A little smarter shopping</h3>
        <CompareButton id={product.id} />
      </div>
      <p>
        {points.length > 1
          ? `Recorded range: ${money(lo)}–${money(hi)}. Price history covers the last 90 days.`
          : 'Track this find at a price that feels right. Recorded price changes will appear here.'}
      </p>
      {points.length > 1 && (
        <svg
          className="price-chart"
          viewBox="0 0 400 90"
          role="img"
          aria-label={`Recorded price history from ${money(points[0].priceMinor)} to ${money(points[points.length - 1].priceMinor)}`}
        >
          <path
            d={`M ${points.map((p, i) => `${10 + (i * 380) / Math.max(1, points.length - 1)},${75 - ((p.priceMinor - lo) / Math.max(1, hi - lo)) * 60}`).join(' L ')}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <line x1="10" x2="390" y1="80" y2="80" stroke="currentColor" opacity=".15" />
        </svg>
      )}
      <form
        className="alert-form"
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Number(new FormData(e.currentTarget).get('target'));
          void watch('PRICE', Math.round(amount * 100));
        }}
      >
        <label>
          Alert me below (৳)
          <input
            name="target"
            type="number"
            step="0.01"
            min="0.01"
            max={(variant.priceMinor - 1) / 100}
            placeholder={((variant.priceMinor * 0.9) / 100).toFixed(2)}
            required
            aria-label="Target price in taka"
          />
        </label>
        <button className="button secondary" disabled={busy}>
          {done === 'PRICE' ? <Check size={17} /> : <Bell size={17} />}Price alert
        </button>
      </form>
      {variant.stockQty <= variant.reservedQty && (
        <button className="text-link" disabled={busy} onClick={() => void watch('STOCK')}>
          <Bell size={17} />
          Notify me when it’s back
        </button>
      )}
      <Link className="text-link" href="/activity">
        Manage your alerts →
      </Link>
    </section>
  );
}
