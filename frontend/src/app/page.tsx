'use client';
import Link from 'next/link';
import { useState } from 'react';
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
  Heart,
  GitCompareArrows,
  Bell,
  Store,
  PackageCheck,
} from 'lucide-react';
import { useApi } from '@/lib/api';
import { CatalogResult, Category } from '@/lib/types';
import { ProductCard } from '@/components/product-card';
import { ErrorBox, Loading } from '@/components/ui';
import './landing.css';
const icons: Record<string, typeof Armchair> = {
  Armchair,
  Headphones,
  Shirt,
  Sparkles,
  Coffee,
  Watch,
};
const edits = [
  ['', 'The good edit'],
  ['home-living', 'For your space'],
  ['electronics', 'For your rhythm'],
  ['fashion', 'For your everyday'],
];
export default function Home() {
  const [edit, setEdit] = useState('');
  const products = useApi<CatalogResult>(`/products?limit=8${edit ? `&category=${edit}` : ''}`);
  const categories = useApi<Category[]>('/categories');
  return (
    <div className="landing">
      <section className="container landing-hero">
        <div className="reveal">
          <div className="issue-label">
            <span />
            Independent stores. Considered living.
          </div>
          <h1>
            Good finds.
            <br />
            For your <em>everyday.</em>
          </h1>
          <p className="landing-lede">
            A softer corner of the internet. Discover thoughtful things, meet the people behind
            them, and make the everyday a little less ordinary.
          </p>
          <div className="landing-actions">
            <Link className="button" href="/shop">
              Find your next favourite <ArrowUpRight size={20} />
            </Link>
            <Link className="text-link" href="#the-edit">
              Explore the edit <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-footnote">
            <span>
              <ShieldCheck size={18} />
              Verified stores
            </span>
            <i />
            <span>
              <PackageCheck size={18} />
              Secure checkout
            </span>
            <i />
            <span>Made for you</span>
          </div>
        </div>
        <div className="editorial-scene reveal-later">
          <img
            src="/products/hero.jpg"
            alt="A sunlit room with considered furniture, warm materials and natural textures"
            fetchPriority="high"
          />
          <span className="scene-caption">THE ART OF EVERYDAY LIVING</span>
          <span className="scene-stamp">
            LESS ORDINARY<b>✳</b>MORE YOU
          </span>
          <Link href="/shop?category=home-living" className="scene-product">
            <img src="/products/01.jpg" alt="Everyday lounge chair" />
            <span>
              <small>THE HOME & LIVING EDIT</small>
              <strong>Stay a little longer.</strong>
              <small>Find your favourite corner</small>
            </span>
            <ArrowUpRight size={23} />
          </Link>
          <span className="scene-side-note">GOOD THINGS, FOUND HERE — BAZAAR</span>
        </div>
      </section>
      <div className="manifesto-strip">
        <span>Independent by nature</span>
        <b>✳</b>
        <span>Thoughtful by design</span>
        <b>✳</b>
        <span>A little more you</span>
      </div>
      <section className="container landing-section" aria-labelledby="category-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FOLLOW YOUR CURIOSITY</p>
            <h2 id="category-title">A world of little possibilities.</h2>
          </div>
          <Link className="text-link" href="/shop">
            All good things <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="category-grid">
          {categories.data?.map((c) => {
            const Icon = icons[c.icon] || Sparkles;
            return (
              <Link className="category-card" key={c.id} href={`/shop?category=${c.id}`}>
                <span>
                  <Icon size={29} strokeWidth={1.3} />
                </span>
                <h3>{c.name}</h3>
                <p>{c._count.products} good finds</p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="container landing-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A MOOD. A MOMENT. A NEW FAVOURITE.</p>
            <h2>Find your kind of everyday.</h2>
          </div>
          <span className="muted">Consider this your starting point.</span>
        </div>
        <div className="collection-grid">
          {[
            {
              href: '/shop?category=home-living',
              image: '/products/hero.jpg',
              alt: 'A calm, naturally styled home',
              number: '01 / SPACE TO SLOW DOWN',
              title: (
                <>
                  A little more
                  <br />
                  at home.
                </>
              ),
            },
            {
              href: '/shop?category=electronics',
              image: '/products/02.jpg',
              alt: 'Studio headphones for everyday listening',
              number: '02 / YOUR OWN FREQUENCY',
              title: (
                <>
                  Tune into
                  <br />
                  your world.
                </>
              ),
            },
            {
              href: '/shop?category=lifestyle',
              image: '/products/10.jpg',
              alt: 'Coffee and the simple rituals of a thoughtful morning',
              number: '03 / SMALL DAILY RITUALS',
              title: (
                <>
                  Make a moment
                  <br />
                  of the ordinary.
                </>
              ),
            },
          ].map((c) => (
            <Link className="collection-tile" href={c.href} key={c.href}>
              <img src={c.image} alt={c.alt} loading="lazy" />
              <div className="collection-copy">
                <span>{c.number}</span>
                <h3>{c.title}</h3>
                <ArrowUpRight size={25} />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section id="the-edit" className="container featured-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LESS SCROLLING. MORE FINDING.</p>
            <h2>
              The good finds edit<span className="title-dot">.</span>
            </h2>
            <p className="muted">Good design. Real usefulness. That just-right feeling.</p>
          </div>
          <Link href="/shop?sort=newest" className="text-link">
            Freshly discovered <ArrowRight size={18} />
          </Link>
        </div>
        <div className="curated-tabs" aria-label="Product edits">
          {edits.map(([id, label]) => (
            <button
              key={id}
              className={edit === id ? 'active' : ''}
              aria-pressed={edit === id}
              onClick={() => setEdit(id)}
            >
              {label}
            </button>
          ))}
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
        <div className="landing-product-footer">
          <Link className="button secondary" href="/shop">
            There’s more where that came from <ArrowUpRight size={19} />
          </Link>
        </div>
      </section>
      <section className="container">
        <div className="makers-story">
          <div className="makers-photo">
            <img
              src="/products/04.jpg"
              alt="A ceramic cup, a small detail that makes a daily ritual feel special"
              loading="lazy"
            />
            <div className="maker-photo-note">
              <strong>Objects with a little more soul.</strong>
              <span>Discover the home & lifestyle stores</span>
            </div>
          </div>
          <div className="makers-copy">
            <p className="eyebrow">BEHIND EVERY GOOD FIND</p>
            <h2>
              Small stores.
              <br />A bigger story.
            </h2>
            <p>
              There’s a person behind the product. A point of view behind the collection. And a
              whole lot of care in the details.
            </p>
            <p>
              We bring independent stores together, so your next favourite can be a discovery worth
              making.
            </p>
            <Link href="/stores" className="button secondary">
              Meet the independents <ArrowUpRight size={19} />
            </Link>
            <span className="maker-signature">Good things from good people.</span>
          </div>
        </div>
      </section>
      <section className="container smart-shopping">
        <div>
          <p className="eyebrow">THOUGHTFUL FINDS. THOUGHTFUL TOOLS.</p>
          <h2>
            Follow your taste.
            <br />
            We’ll mind the details.
          </h2>
          <p>
            Save the ones you love, compare the details, and let the right find come to you at the
            right price.
          </p>
          <Link className="text-link" href="/discover">
            Make your edit personal <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="shopping-capabilities">
          {[
            [
              Heart,
              'Keep the good ones close',
              'Your saved favourites, synced to your account.',
              '/wishlist',
            ],
            [
              GitCompareArrows,
              'A clearer comparison',
              'Up to four finds. Every detail, side by side.',
              '/compare',
            ],
            [
              Bell,
              'A price worth waiting for',
              'Set your target. Get price and restock alerts.',
              '/activity',
            ],
            [
              Store,
              'Stay close to your stores',
              'Follow independents and discover more of what feels like you.',
              '/stores',
            ],
          ].map(([Icon, title, body, href]) => {
            const I = Icon as typeof Heart;
            return (
              <Link className="capability" href={href as string} key={title as string}>
                <I size={25} strokeWidth={1.5} />
                <h3>{title as string} ↗</h3>
                <p>{body as string}</p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="container">
        <div className="seller-invitation">
          <div>
            <p className="eyebrow">FOR THE PEOPLE WHO MAKE GOOD THINGS</p>
            <h2>
              Your products.
              <br />
              Your story. Our marketplace.
            </h2>
            <p>
              Bring your independent store to Bazaar. From your first listing to your next chapter,
              there’s room to grow here.
            </p>
          </div>
          <Link href="/sell" className="button">
            Start your store <ArrowUpRight size={20} />
          </Link>
        </div>
      </section>
      <section className="container landing-faq">
        <p className="eyebrow">A LITTLE PEACE OF MIND</p>
        <h2>Good questions, thoughtful answers.</h2>
        {[
          [
            'How does shopping from several stores work?',
            'Add finds from different stores to one bag and check out together. Each store packs and ships its own part of your order. Shipping is shown per store before you pay.',
          ],
          [
            'Can I return something that isn’t quite right?',
            'Eligible delivered items can be requested for return from your orders. The marketplace’s current return window and any restocking fee are shown during the return process.',
          ],
          [
            'How do price and stock alerts work?',
            'Sign in, open a product and set a price target or request a restock alert. When the condition is met, we notify your account. Manage everything from your shopping radar.',
          ],
          [
            'How can I sell on Bazaar?',
            'Apply with your store details, complete verification, and add your products for review. Your seller workspace includes inventory, fulfillment, earnings and analytics.',
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
