'use client';
import Link from 'next/link';
import { Heart, Plus, Star } from 'lucide-react';
import { Product, money } from '@/lib/types';
import { useStore } from './provider';
import { CompareButton } from './shopping-tools';
import { ProductImage } from './product-image';
export function ProductCard({ product: p }: { product: Product }) {
  const { wishlist, toggleWish, add } = useStore();
  const v = p.variants[0],
    saved = wishlist.includes(p.id),
    rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0;
  const discount =
    v.compareAtMinor && v.compareAtMinor > v.priceMinor
      ? Math.round((1 - v.priceMinor / v.compareAtMinor) * 100)
      : 0;
  return (
    <article className="product-card">
      <div className="product-image">
        <Link href={`/product/${p.slug}`} tabIndex={-1}>
          <ProductImage src={p.image} alt={p.title} loading="lazy" />
        </Link>
        {discount > 0 && <span className="discount">−{discount}%</span>}
        <button
          className={`wish-button ${saved ? 'saved' : ''}`}
          aria-label={`${saved ? 'Remove' : 'Save'} ${p.title}`}
          aria-pressed={saved}
          onClick={() => toggleWish(p.id)}
        >
          <Heart size={19} fill={saved ? 'currentColor' : 'none'} />
        </button>
        <button
          className="quick-add"
          disabled={v.stockQty - v.reservedQty < 1}
          onClick={() => void add(v.id)}
          aria-label={`Add ${p.title} to bag`}
        >
          <Plus size={19} />
          {v.stockQty - v.reservedQty > 0 ? 'Add to bag' : 'Out of stock'}
        </button>
      </div>
      <div className="product-meta">
        <CompareButton id={p.id} />
        <Link className="vendor-name" href={`/shop?vendor=${p.vendor.slug}`}>
          {p.vendor.storeName}
        </Link>
        <h3>
          <Link href={`/product/${p.slug}`}>{p.title}</Link>
        </h3>
        <div className="product-bottom">
          <span className="price">
            {money(v.priceMinor)} {v.compareAtMinor && <del>{money(v.compareAtMinor)}</del>}
          </span>
          <span className="rating">
            <Star size={14} fill="currentColor" />
            {rating ? rating.toFixed(1) : 'New'}
            {rating > 0 && <span> ({p.reviews.length})</span>}
          </span>
        </div>
      </div>
    </article>
  );
}
