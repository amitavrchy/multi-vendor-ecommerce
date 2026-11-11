'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '@/components/provider';
import { api, json } from '@/lib/api';
import { money } from '@/lib/types';
import { Empty, PageTitle } from '@/components/ui';
import { Gate } from '@/components/gate';
function Cart() {
  const { cart, refresh, toast } = useStore(),
    [busy, setBusy] = useState(false);
  const goods = cart.reduce((s, i) => s + i.qty * i.variant.priceMinor, 0),
    vendors = new Set(cart.map((i) => i.variant.product.vendorId)),
    shipping = vendors.size * 8000;
  const change = async (id: string, qty: number) => {
    setBusy(true);
    try {
      await api('/cart/items', json({ variantId: id, qty }));
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container page">
      <PageTitle
        eyebrow="YOUR GOOD FINDS"
        title="A bag full of possibility."
        description={`${cart.length} ${cart.length === 1 ? 'find' : 'finds'} from ${vendors.size} independent ${vendors.size === 1 ? 'store' : 'stores'}`}
      />
      {!cart.length ? (
        <Empty
          title="Good things are waiting"
          text="Your bag is empty. Let’s find something you’ll love."
        />
      ) : (
        <div className="checkout-layout">
          <div>
            {[...vendors].map((vendorId) => (
              <section className="panel cart-vendor" key={vendorId}>
                <div className="section-heading">
                  <h3>
                    {
                      cart.find((i) => i.variant.product.vendorId === vendorId)?.variant.product
                        .vendor.storeName
                    }
                  </h3>
                  <span className="verified">
                    <ShieldCheck size={15} /> Verified store
                  </span>
                </div>
                {cart
                  .filter((i) => i.variant.product.vendorId === vendorId)
                  .map((i) => (
                    <article className="cart-item" key={i.id}>
                      <Link href={`/product/${i.variant.product.slug}`}>
                        <img src={i.variant.product.image} alt={i.variant.product.title} />
                      </Link>
                      <div className="cart-item-copy">
                        <h3>
                          <Link href={`/product/${i.variant.product.slug}`}>
                            {i.variant.product.title}
                          </Link>
                        </h3>
                        <p className="muted">{Object.values(i.variant.attrs).join(' · ')}</p>
                        <strong>{money(i.variant.priceMinor)}</strong>
                      </div>
                      <div className="cart-item-actions">
                        <div className="quantity">
                          <button
                            aria-label={`Decrease ${i.variant.product.title}`}
                            disabled={busy || i.qty <= 1}
                            onClick={() => void change(i.variant.id, i.qty - 1)}
                          >
                            <Minus size={15} />
                          </button>
                          <span>{i.qty}</span>
                          <button
                            aria-label={`Increase ${i.variant.product.title}`}
                            disabled={busy || i.qty >= 99}
                            onClick={() => void change(i.variant.id, i.qty + 1)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <button
                          className="text-button muted"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              await api(`/cart/items/${i.id}`, { method: 'DELETE' });
                              await refresh();
                            } catch (e) {
                              toast((e as Error).message);
                            }
                          }}
                        >
                          <Trash2 size={15} /> Remove
                        </button>
                      </div>
                    </article>
                  ))}
              </section>
            ))}
            <Link href="/shop" className="text-link">
              ← Keep discovering
            </Link>
          </div>
          <aside className="panel order-summary">
            <h2>The little details</h2>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(goods)}</dd>
              </div>
              <div>
                <dt>Delivery · {vendors.size} stores</dt>
                <dd>{money(shipping)}</dd>
              </div>
              <div className="total">
                <dt>Total</dt>
                <dd>{money(goods + shipping)}</dd>
              </div>
            </dl>
            <p className="muted">Have a coupon? Add it at checkout.</p>
            <Link className="button full" href="/checkout">
              Continue to checkout <ArrowRight size={18} />
            </Link>
            <p className="secure-note">
              <ShieldCheck size={16} /> Secure checkout. Always.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
export default function CartPage() {
  return (
    <Gate>
      <Cart />
    </Gate>
  );
}
