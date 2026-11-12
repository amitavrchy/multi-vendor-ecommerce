'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/components/provider';
import { ProductCard } from '@/components/product-card';
import { useApi } from '@/lib/api';
import { CatalogResult, Product } from '@/lib/types';
import { Loading, ErrorBox, PageTitle, Empty } from '@/components/ui';
export default function Discover() {
  const { user } = useStore();
  const recs = useApi<{ items: Product[]; reason: string }>(user ? '/discovery/for-you' : null);
  const featured = useApi<CatalogResult>(!user ? '/products?limit=8' : null);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem('bazaar-recent') || '[]');
      if (Array.isArray(ids))
        setRecent(ids.filter((id): id is string => typeof id === 'string').slice(0, 12));
    } catch {
      /* optional local history */
    }
  }, []);
  const history = useApi<Product[]>(recent.length ? `/wishlist?ids=${recent.join(',')}` : null);
  const products = user ? recs.data?.items : featured.data?.items;
  const error = recs.error || featured.error;
  return (
    <div className="container page">
      <PageTitle
        eyebrow="A LITTLE MORE YOU"
        title="Your discovery edit."
        description={
          user
            ? recs.data?.reason
            : 'A thoughtful place to start. Sign in and save a few favourites for a more personal edit.'
        }
        action={
          <Link className="button secondary" href="/activity">
            Your shopping radar →
          </Link>
        }
      />
      {error ? (
        <ErrorBox message={error} />
      ) : recs.loading || featured.loading ? (
        <Loading />
      ) : products?.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <Empty
          title="Your next find is waiting"
          text="Explore the marketplace to start your discovery edit."
        />
      )}
      {!!history.data?.length && (
        <section className="section-space">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WORTH ANOTHER LOOK</p>
              <h2>Recently on your radar</h2>
            </div>
            <button
              className="text-link"
              onClick={() => {
                localStorage.removeItem('bazaar-recent');
                setRecent([]);
                history.setData([]);
              }}
            >
              Clear history
            </button>
          </div>
          <div className="product-grid">
            {recent
              .map((id) => history.data?.find((p) => p.id === id))
              .filter((p): p is Product => !!p)
              .map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
