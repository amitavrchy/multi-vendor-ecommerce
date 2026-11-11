'use client';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Armchair,
  Headphones,
  Shirt,
  Sparkles,
  Coffee,
  Watch,
  ShieldCheck,
  Check,
  MoveUpRight,
} from 'lucide-react';
import { useApi } from '@/lib/api';
import { CatalogResult, Category } from '@/lib/types';
import { ProductCard } from '@/components/product-card';
import { ErrorBox, Loading } from '@/components/ui';
const icons: Record<string, typeof Armchair> = {
  Armchair,
  Headphones,
  Shirt,
  Sparkles,
  Coffee,
  Watch,
};
export default function Home() {
  const products = useApi<CatalogResult>('/products?limit=8'),
    categories = useApi<Category[]>('/categories');
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> A marketplace with a little more heart
          </p>
          <h1>
            Good finds.
            <br />
            For your <em>everyday.</em>
          </h1>
          <p>
            Thoughtfully chosen essentials. Independent stores.
            <br className="desktop" /> A whole lot to love, all in one place.
          </p>
          <Link href="/shop" className="button">
            Explore the marketplace <ArrowUpRight size={20} />
          </Link>
          <div className="hero-proof">
            <div className="avatar-stack">
              <span>MR</span>
              <span>AH</span>
              <span>NI</span>
            </div>
            <div>
              <strong>Small stores. Big on quality.</strong>
              <span>Meet your new favourite makers.</span>
            </div>
          </div>
        </div>
        <div className="hero-photo">
          <img
            src="/products/hero.jpg"
            alt="Warm, thoughtfully styled living room with natural textures"
            fetchPriority="high"
          />
          <span className="photo-label">THE EVERYDAY EDIT · VOL. 01</span>
          <Link href="/shop?category=home-living" className="floating-product">
            <span className="floating-icon">
              <Armchair size={25} />
            </span>
            <span>
              <strong>A little more at home</strong>
              <small>Explore Home & living</small>
            </span>
            <ArrowUpRight size={20} />
          </Link>
          <span className="hero-seal">
            LESS ORDINARY
            <br />
            <b>✳</b>
            <br />
            MORE YOU
          </span>
        </div>
      </section>
      <section className="container categories-section">
        <div className="section-heading">
          <h2>A little something for every day</h2>
          <Link href="/shop" className="text-link">
            Explore all <ArrowRight size={17} />
          </Link>
        </div>
        <div className="category-grid">
          {categories.data?.map((c) => {
            const Icon = icons[c.icon] || Sparkles;
            return (
              <Link href={`/shop?category=${c.id}`} key={c.id} className="category-card">
                <span>
                  <Icon size={28} strokeWidth={1.4} />
                </span>
                <h3>{c.name}</h3>
                <p>{c._count.products} good finds</p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="container featured-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURATED, NOT COMPLICATED</p>
            <h2>
              The good finds edit<span className="title-dot">.</span>
            </h2>
            <p className="muted">The pieces we love. The ones you’ll reach for again and again.</p>
          </div>
          <Link className="text-link" href="/shop?sort=featured">
            Shop the edit <ArrowRight size={18} />
          </Link>
        </div>
        {products.loading ? (
          <Loading />
        ) : products.error ? (
          <ErrorBox message={products.error} retry={() => void products.refresh()} />
        ) : (
          <div className="product-grid">
            {products.data?.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
      <section className="container story-banner">
        <div className="story-mark">✳</div>
        <div>
          <p className="eyebrow">BEHIND EVERY GOOD FIND</p>
          <h2>Real people. Remarkable little stores.</h2>
          <p>
            Shop independent. Discover something different.
            <br />
            Make someone’s small business a part of your everyday.
          </p>
          <Link href="/stores" className="text-link">
            Meet the stores <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="story-cards">
          <span>
            <ShieldCheck />
            Verified local sellers
          </span>
          <span>
            <Check />
            Thoughtfully selected
          </span>
          <span>
            <MoveUpRight />
            Growing together
          </span>
        </div>
      </section>
      <section className="container seller-banner">
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h2>Good things deserve to be discovered.</h2>
          <p>Bring your store to Bazaar. We’ll make room for your story.</p>
        </div>
        <Link href="/sell" className="button">
          Become a seller <ArrowUpRight size={19} />
        </Link>
      </section>
    </>
  );
}
