'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { io } from 'socket.io-client';
import { api, json } from '@/lib/api';
import { CartItem, User } from '@/lib/types';
type Store = {
  user: User | null;
  ready: boolean;
  cart: CartItem[];
  wishlist: string[];
  comparison: string[];
  toggleCompare: (id: string) => void;
  refresh: () => Promise<void>;
  toast: (message: string) => void;
  add: (variantId: string, qty?: number) => Promise<void>;
  toggleWish: (id: string) => void;
  logout: () => Promise<void>;
};
const Context = createContext<Store>(null!);
export const useStore = () => useContext(Context);
export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [cart, setCart] = useState<CartItem[]>([]),
    [wishlist, setWishlist] = useState<string[]>([]),
    [comparison, setComparison] = useState<string[]>([]),
    [message, setMessage] = useState('');
  const wishPending = useRef(new Set<string>());
  const toast = useCallback((m: string) => setMessage(m), []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(t);
  }, [message]);
  const refresh = useCallback(async () => {
    try {
      const u = await api<User>('/auth/me');
      setUser(u);
    } catch {
      setUser(null);
      setCart([]);
      setReady(true);
      return;
    }
    try {
      const c = await api<{ items: CartItem[] }>('/cart');
      setCart(c.items);
      let guest: string[] = [];
      try {
        guest = JSON.parse(localStorage.getItem('bazaar-wishlist') || '[]');
      } catch {
        /* no guest favourites */
      }
      const saved = await api<{ id: string }[]>(
        Array.isArray(guest) && guest.length ? '/discovery/saved/merge' : '/discovery/saved',
        Array.isArray(guest) && guest.length
          ? json({
              ids: guest
                .filter((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id))
                .slice(0, 200),
            })
          : {},
      );
      setWishlist(saved.map((p) => p.id));
      try {
        localStorage.removeItem('bazaar-wishlist');
      } catch {
        /* account favourites are still saved on the server */
      }
    } catch {
      toast('Your account is signed in, but shopping data could not refresh. Please retry.');
    } finally {
      setReady(true);
    }
  }, [toast]);
  useEffect(() => {
    void refresh();
    try {
      const compare: unknown = JSON.parse(localStorage.getItem('bazaar-compare') || '[]');
      if (Array.isArray(compare))
        setComparison(compare.filter((id): id is string => typeof id === 'string').slice(0, 4));
      const saved: unknown = JSON.parse(localStorage.getItem('bazaar-wishlist') || '[]');
      if (Array.isArray(saved))
        setWishlist(saved.filter((id): id is string => typeof id === 'string'));
    } catch {
      /* invalid local storage is reset */
    }
  }, [refresh]);
  useEffect(() => {
    if (!user) return;
    const s = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4187', {
      withCredentials: true,
    });
    s.on('order.status_changed', () => {
      toast('Your order has an update');
      window.dispatchEvent(new Event('orders-updated'));
    });
    s.on('order.new', () => {
      toast('A new order just arrived');
      window.dispatchEvent(new Event('orders-updated'));
    });
    s.on('shopping.alert', (p: { title: string }) => {
      toast(p.title);
      window.dispatchEvent(new Event('shopping-alert'));
    });
    return () => {
      s.disconnect();
    };
  }, [user, toast]);
  const add = async (variantId: string, qty = 1) => {
    if (!user) {
      toast('Sign in to add items to your bag');
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    try {
      const old = cart.find((i) => i.variant.id === variantId);
      await api('/cart/items', json({ variantId, qty: (old?.qty || 0) + qty }));
      await refresh();
      toast('Added to your bag');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const toggleWish = (id: string) => {
    if (wishPending.current.has(id)) return;
    const removing = wishlist.includes(id);
    const update = () =>
      setWishlist((old) =>
        removing ? old.filter((x) => x !== id) : [...new Set([...old, id])].slice(0, 200),
      );
    if (user) {
      wishPending.current.add(id);
      void api(
        removing ? `/discovery/saved/${id}` : '/discovery/saved',
        removing ? { method: 'DELETE' } : json({ productId: id }),
      )
        .then(update)
        .catch((e) => toast(e.message))
        .finally(() => wishPending.current.delete(id));
    } else {
      const next = removing ? wishlist.filter((x) => x !== id) : [...wishlist, id].slice(0, 200);
      try {
        localStorage.setItem('bazaar-wishlist', JSON.stringify(next));
        update();
      } catch {
        toast('Your browser could not save this wishlist');
      }
    }
  };
  const toggleCompare = (id: string) => {
    if (!comparison.includes(id) && comparison.length >= 4) {
      toast('Compare up to four finds at a time');
      return;
    }
    const next = comparison.includes(id) ? comparison.filter((x) => x !== id) : [...comparison, id];
    try {
      localStorage.setItem('bazaar-compare', JSON.stringify(next));
      setComparison(next);
    } catch {
      toast('Your browser could not save this comparison');
    }
  };
  const logout = async () => {
    await api('/auth/logout', json({}));
    setUser(null);
    setCart([]);
    window.location.href = '/';
  };
  return (
    <Context.Provider
      value={{
        user,
        ready,
        cart,
        wishlist,
        comparison,
        toggleCompare,
        refresh,
        toast,
        add,
        toggleWish,
        logout,
      }}
    >
      {children}
      <div className={`toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">
        {message}
      </div>
    </Context.Provider>
  );
}
