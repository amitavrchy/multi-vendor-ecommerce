'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
  X,
  Truck,
  ShieldCheck,
  Instagram,
  Globe,
  Store,
} from 'lucide-react';
import { useStore } from './provider';
export function Shell({ children }: { children: React.ReactNode }) {
  const { user, cart, wishlist, logout } = useStore(),
    path = usePathname(),
    router = useRouter();
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        <span>Good finds. Great people. One marketplace.</span>
        <Link href="/shop">
          A little welcome gift: 10% off with WELCOME10 <ArrowUpRight size={14} />
        </Link>
      </div>
      <header className="header">
        <div className="container header-main">
          <Link href="/" className="wordmark" aria-label="Bazaar home">
            bazaar<span>✳</span>
          </Link>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/shop?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search size={20} />
            <input
              aria-label="Search products"
              placeholder="Search for your next good find…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="header-actions">
            <Link href={user ? '/account' : '/login'} className="account-link">
              <UserRound size={21} />
              <span>{user ? user.name.split(' ')[0] : 'Sign in'}</span>
            </Link>
            <Link
              className="icon-button counter"
              href="/wishlist"
              aria-label={`Wishlist, ${wishlist.length} saved items`}
            >
              <Heart size={22} />
              {wishlist.length > 0 && <b>{wishlist.length}</b>}
            </Link>
            <Link
              className="icon-button counter"
              href="/cart"
              aria-label={`Shopping bag, ${cart.reduce((s, i) => s + i.qty, 0)} items`}
            >
              <ShoppingBag size={22} />
              {cart.length > 0 && <b>{cart.reduce((s, i) => s + i.qty, 0)}</b>}
            </Link>
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle menu"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        <div className="nav-wrap">
          <nav
            className={`container navigation ${open ? 'open' : ''}`}
            aria-label="Main navigation"
          >
            <div className="nav-links">
              {[
                ['/shop', 'All categories'],
                ['/shop?sort=newest', 'New arrivals'],
                ['/shop?sort=featured', 'The good edit'],
                ['/stores', 'Our stores'],
              ].map(([href, label], i) => (
                <Link
                  className={path === href ? 'active' : ''}
                  key={label}
                  href={href}
                  onClick={() => setOpen(false)}
                >
                  {i === 0 && <Menu size={17} />} {label}
                  {i === 0 && <ChevronDown size={15} />}
                </Link>
              ))}
            </div>
            <div className="nav-links">
              <Link href="/sell">
                <Store size={16} /> Become a seller <ArrowUpRight size={15} />
              </Link>
              {user && (
                <>
                  <Link
                    href={
                      user.role === 'PLATFORM_ADMIN' || user.role === 'SUPPORT_AGENT'
                        ? '/admin'
                        : user.role.startsWith('VENDOR')
                          ? '/vendor'
                          : '/orders'
                    }
                  >
                    {user.role === 'CUSTOMER' ? 'My orders' : 'Dashboard'}
                  </Link>
                  <Link href="/support">Support</Link>
                  <button className="text-button" onClick={() => void logout()}>
                    Sign out
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <section className="trust-strip">
        <div className="container trust-inner">
          <span>
            <Truck />
            Local stores, delivered to you
          </span>
          <span>
            <ShieldCheck />
            Secure checkout, always
          </span>
          <span>
            <ShoppingBag />
            Easy eligible returns
          </span>
          <span>
            <Heart />
            Good things from good people
          </span>
        </div>
      </section>
      <footer>
        <div className="container footer-grid">
          <div>
            <Link href="/" className="wordmark">
              bazaar<span>✳</span>
            </Link>
            <p>
              A whole world of good finds.
              <br />A little closer to home.
            </p>
            <span className="social">
              <Instagram size={20} />
              <Globe size={20} /> Made for everyday living.
            </span>
          </div>
          <div>
            <h3>Discover</h3>
            <Link href="/shop">Shop all</Link>
            <Link href="/shop?sort=newest">New arrivals</Link>
            <Link href="/stores">Meet the makers</Link>
          </div>
          <div>
            <h3>Your Bazaar</h3>
            <Link href="/account">My account</Link>
            <Link href="/orders">Orders & returns</Link>
            <Link href="/wishlist">Saved favourites</Link>
          </div>
          <div>
            <h3>Build something good</h3>
            <p>
              Your products. Your story.
              <br />
              Our community.
            </p>
            <Link href="/sell" className="footer-seller">
              Open your store <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Bazaar Marketplace</span>
          <Link href="/help">Help, delivery & returns</Link>
          <span>BDT ৳ · Bangladesh</span>
        </div>
      </footer>
    </>
  );
}
