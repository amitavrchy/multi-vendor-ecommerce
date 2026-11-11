'use client';
import { useStore } from '@/components/provider';
import { useApi } from '@/lib/api';
import { Product } from '@/lib/types';
import { ProductCard } from '@/components/product-card';
import { Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';
export default function Wishlist() {
  const { wishlist } = useStore(),
    { data, error, loading } = useApi<Product[]>(
      `/wishlist?ids=${encodeURIComponent(wishlist.slice(0, 200).join(','))}`,
    );
  const items = data?.filter((p) => wishlist.includes(p.id));
  return (
    <div className="container page">
      <PageTitle
        eyebrow="KEEP THE GOOD ONES CLOSE"
        title="Your saved favourites."
        description="A little collection of things that feel like you. Saved on this browser."
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : items?.length ? (
        <div className="product-grid">
          {items.map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
        </div>
      ) : (
        <Empty
          title="A little room for favourites"
          text="Tap the heart on anything you love. We’ll keep it here for you."
        />
      )}
    </div>
  );
}
