'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, MapPin, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { api, json, useApi } from '@/lib/api';
import { Address, CartItem, money } from '@/lib/types';
import { useStore } from '@/components/provider';
import { Gate } from '@/components/gate';
import { AddressForm } from '@/components/address-form';
import { Empty, ErrorBox, Loading, Modal, PageTitle } from '@/components/ui';
type Quote = {
  items: CartItem[];
  retailGoodsMinor: number;
  couponFunding?: string | null;
  goodsMinor: number;
  discountMinor: number;
  shippingMinor: number;
  grandMinor: number;
};
function Checkout() {
  const { cart: bag, refresh } = useStore(),
    search = useSearchParams(),
    quoteId = search.get('quote') || undefined,
    renewalId = search.get('renewal') || undefined,
    router = useRouter(),
    addresses = useApi<Address[]>('/profile/addresses'),
    methods = useApi<{ code: string; available: boolean }[]>('/payments/providers'),
    [addressId, setAddressId] = useState(''),
    [provider, setProvider] = useState('COD'),
    [addAddress, setAddAddress] = useState(false),
    [code, setCode] = useState(''),
    [applied, setApplied] = useState(''),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(''),
    [couponError, setCouponError] = useState(''),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState('');
  useEffect(() => {
    let active = true;
    setQuote(null);
    setApplied('');
    setCode('');
    setError('');
    setKey(crypto.randomUUID());
    api<Quote>('/checkout/preview', json({ quoteId, renewalId }))
      .then((value) => {
        if (active) setQuote(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [quoteId, renewalId]);
  const cart = quote?.items || bag;
  const selected = addressId || addresses.data?.[0]?.id;
  if ((quoteId || renewalId) && !quote)
    return (
      <div className="container page">{error ? <ErrorBox message={error} /> : <Loading />}</div>
    );
  if (!cart.length)
    return (
      <Empty
        title="Your bag is ready for a new beginning"
        text="Add a few good finds to start checkout."
      />
    );
  return (
    <div className="container page">
      <PageTitle
        eyebrow="ONE LAST LITTLE STEP"
        title="Make it yours."
        description="One checkout. Every store. Delivered with care."
      />
      <form
        className="checkout-layout"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!selected) {
            setError('Add a shipping address first');
            return;
          }
          setBusy(true);
          setError('');
          try {
            const result = await api<{
              orderId: string;
              intent: { redirectUrl?: string };
              status: string;
            }>('/checkout/session', {
              ...json({
                addressId: selected,
                provider,
                quoteId,
                renewalId,
                ...(applied ? { couponCode: applied } : {}),
              }),
              headers: { 'Idempotency-Key': key },
            });
            if (['CANCELLED', 'FAILED'].includes(result.status)) {
              setKey(crypto.randomUUID());
              throw new Error('This checkout was cancelled. Please place your order again.');
            }
            await refresh();
            if (result.intent?.redirectUrl) {
              window.location.assign(result.intent.redirectUrl);
              return;
            }
            router.push('/orders?placed=1');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="checkout-sections">
          <section className="panel">
            <div className="section-heading">
              <h2>
                <span className="step-number">1</span> Where should we send it?
              </h2>
              <button type="button" className="text-link" onClick={() => setAddAddress(true)}>
                <Plus size={17} />
                Add address
              </button>
            </div>
            {addresses.loading ? (
              <Loading />
            ) : addresses.error ? (
              <ErrorBox message={addresses.error} />
            ) : !addresses.data?.length ? (
              <p className="muted">Add your first delivery address to continue.</p>
            ) : (
              addresses.data.map((a) => (
                <label className={`choice-card ${selected === a.id ? 'selected' : ''}`} key={a.id}>
                  <input
                    type="radio"
                    name="address"
                    value={a.id}
                    checked={selected === a.id}
                    onChange={() => setAddressId(a.id)}
                  />
                  <MapPin size={20} />
                  <span>
                    <strong>
                      {a.label} · {a.name}
                    </strong>
                    <small>
                      {a.line1}, {a.city} {a.postalCode}
                      <br />
                      {a.phone}
                    </small>
                  </span>
                </label>
              ))
            )}
          </section>
          <section className="panel">
            <h2>
              <span className="step-number">2</span> How would you like to pay?
            </h2>
            <div className="payment-methods">
              {methods.data?.map((m) => (
                <label
                  className={`choice-card ${provider === m.code ? 'selected' : ''} ${!m.available ? 'disabled' : ''}`}
                  key={m.code}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={provider === m.code}
                    disabled={!m.available}
                    onChange={() => setProvider(m.code)}
                  />
                  {m.code === 'COD' ? <Wallet size={22} /> : <CreditCard size={22} />}
                  <span>
                    <strong>
                      {m.code === 'COD'
                        ? 'Cash on delivery'
                        : m.code === 'SSLCOMMERZ'
                          ? 'SSLCommerz'
                          : m.code}
                    </strong>
                    <small>
                      {!m.available
                        ? 'Currently unavailable'
                        : m.code === 'COD'
                          ? 'Pay your delivery partner in cash'
                          : 'Continue to secure payment'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            {methods.error && <ErrorBox message={methods.error} />}
          </section>
          <section className="panel">
            <h2>
              <span className="step-number">3</span> Your good finds
            </h2>
            {cart.map((i) => (
              <div className="checkout-item" key={i.id}>
                <img src={i.variant.product.image} alt="" />
                <div>
                  <strong>{i.variant.product.title}</strong>
                  <small>
                    {i.variant.product.vendor.storeName} · Qty {i.qty}
                  </small>
                </div>
                <span>{money(i.qty * i.variant.priceMinor)}</span>
              </div>
            ))}
          </section>
        </div>
        <aside className="panel order-summary">
          <h2>Order summary</h2>
          <div className="coupon-input">
            <input
              aria-label="Coupon code"
              placeholder="A little welcome gift?"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                try {
                  setQuote(
                    await api('/checkout/preview', json({ couponCode: code, quoteId, renewalId })),
                  );
                  setApplied(code);
                  setCouponError('');
                } catch (e) {
                  setCouponError((e as Error).message);
                }
              }}
            >
              Apply
            </button>
          </div>
          {couponError && <p className="form-error">{couponError}</p>}
          {applied && (
            <p className="success-text">
              {applied} applied ·{' '}
              <button
                type="button"
                className="text-button"
                onClick={async () => {
                  setQuote(await api('/checkout/preview', json({ quoteId, renewalId })));
                  setApplied('');
                  setCode('');
                }}
              >
                Remove
              </button>
            </p>
          )}
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(quote?.goodsMinor || 0)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{money(quote?.shippingMinor || 0)}</dd>
            </div>
            {!!quote?.discountMinor && (
              <div>
                <dt>Your savings</dt>
                <dd>−{money(quote.discountMinor)}</dd>
              </div>
            )}
            <div className="total">
              <dt>Total</dt>
              <dd>{money(quote?.grandMinor || 0)}</dd>
            </div>
          </dl>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy || !selected || !quote}>
            {busy
              ? 'Placing your order…'
              : provider === 'COD'
                ? 'Place your order'
                : 'Continue to payment'}
          </button>
          <p className="secure-note">
            <ShieldCheck size={17} />
            Your order is safe with us.
          </p>
          <p className="fine-print">
            Prices are confirmed at checkout. Shipping is ৳80 per store.{' '}
            {applied
              ? `This discount is funded by ${quote?.couponFunding === 'VENDOR' ? 'participating stores' : 'Bazaar'}.`
              : ''}
          </p>
        </aside>
      </form>
      {addAddress && (
        <Modal title="A place for your good finds" close={() => setAddAddress(false)}>
          <AddressForm
            done={() => {
              setAddAddress(false);
              void addresses.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
export default function CheckoutPage() {
  return (
    <Gate>
      <Suspense fallback={<Loading />}>
        <Checkout />
      </Suspense>
    </Gate>
  );
}
