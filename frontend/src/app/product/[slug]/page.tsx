'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { Heart, Minus, Plus, ShieldCheck, Star, Truck, RotateCcw } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Product, CatalogResult, money } from '@/lib/types';
import { useStore } from '@/components/provider';
import { Empty, ErrorBox, Loading, Action } from '@/components/ui';
import { ProductCard } from '@/components/product-card';
export default function Detail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params),
    { data: p, error, loading } = useApi<Product>(`/products/${slug}`),
    [qty, setQty] = useState(1),
    [selected, setSelected] = useState('');
  const { add, toggleWish, wishlist } = useStore();
  const related = useApi<CatalogResult>(p ? `/products?category=${p.categoryId}&limit=4` : null);
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="container page">
        <ErrorBox message={error} />
      </div>
    );
  if (!p) return <Empty title="Product unavailable" text="Discover another good find." />;
  const v = p.variants.find((v) => v.id === selected) || p.variants[0],
    stock = v.stockQty - v.reservedQty,
    rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0;
  return (
    <div className="container page">
      <p className="breadcrumb">
        <Link href="/shop">Marketplace</Link> /{' '}
        <Link href={`/shop?category=${p.categoryId}`}>{p.category.name}</Link> / {p.title}
      </p>
      <div className="detail-grid">
        <div className="detail-image">
          <img src={p.image} alt={p.title} />
          <span className="image-note">Thoughtful design. Everyday quality.</span>
        </div>
        <section className="detail-info">
          <Link className="eyebrow" href={`/shop?vendor=${p.vendor.slug}`}>
            {p.vendor.storeName} <ShieldCheck size={16} />
          </Link>
          <h1>{p.title}</h1>
          <div className="detail-rating">
            <Star fill="currentColor" size={18} />
            <strong>{rating ? rating.toFixed(1) : 'New find'}</strong>
            <a href="#reviews">{p.reviews.length} verified reviews</a>
          </div>
          <div className="detail-price">
            {money(v.priceMinor)} {v.compareAtMinor && <del>{money(v.compareAtMinor)}</del>}
          </div>
          <p className="muted">{p.description.split('. ').slice(0, 2).join('. ')}.</p>
          {p.variants.length > 1 && (
            <label>
              Choose a variant
              <select
                value={v.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setQty(1);
                }}
              >
                {p.variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {Object.values(x.attrs).join(' / ')}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="detail-attributes">
            {Object.entries(v.attrs).map(([key, value]) => (
              <span key={key}>
                <strong>{key}</strong> {value}
              </span>
            ))}
          </div>
          <p className={stock ? 'stock' : 'out-stock'}>
            <span className="live-dot" />
            {stock ? `In stock · ${stock} available` : 'Currently out of stock'}
          </p>
          <div className="buy-row">
            <div className="quantity">
              <button
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
              >
                <Minus size={16} />
              </button>
              <span>{qty}</span>
              <button
                aria-label="Increase quantity"
                disabled={qty >= Math.min(99, stock)}
                onClick={() => setQty(qty + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <Action disabled={!stock} onClick={() => add(v.id, qty)}>
              Add to bag — {money(v.priceMinor * qty)}
            </Action>
            <button
              className="button secondary"
              aria-label="Save to wishlist"
              aria-pressed={wishlist.includes(p.id)}
              onClick={() => toggleWish(p.id)}
            >
              <Heart fill={wishlist.includes(p.id) ? 'currentColor' : 'none'} size={21} />
            </button>
          </div>
          <div className="delivery-box">
            <p>
              <Truck size={20} />
              <span>
                <strong>Delivered in 2–4 working days</strong>
                <small>৳80 shipping per store. Carefully packed.</small>
              </span>
            </p>
            <p>
              <RotateCcw size={20} />
              <span>
                <strong>A little peace of mind</strong>
                <small>14-day returns on eligible delivered items.</small>
              </span>
            </p>
          </div>
          <details open>
            <summary>The details</summary>
            <p>{p.description}</p>
          </details>
        </section>
      </div>
      <section id="reviews" className="reviews-section">
        <div className="section-heading">
          <h2>From the community</h2>
          <span>{p.reviews.length} verified reviews</span>
        </div>
        {p.reviews.length ? (
          p.reviews.map((r, i) => (
            <article className="review" key={i}>
              <div>
                <strong>{r.user?.name || 'Verified customer'}</strong>
                <span className="rating">{'★'.repeat(r.rating)}</span>
                <span className="verified">Verified purchase</span>
              </div>
              <p>{r.body}</p>
            </article>
          ))
        ) : (
          <p className="muted">
            Be the first to share your experience after your order is delivered.
          </p>
        )}
      </section>
      <section className="featured-section">
        <div className="section-heading">
          <h2>More good things to discover</h2>
          <Link className="text-link" href={`/shop?category=${p.categoryId}`}>
            Explore category →
          </Link>
        </div>
        <div className="product-grid">
          {related.data?.items
            .filter((x) => x.id !== p.id)
            .map((x) => (
              <ProductCard product={x} key={x.id} />
            ))}
        </div>
      </section>
    </div>
  );
}
