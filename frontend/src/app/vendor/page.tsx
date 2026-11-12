'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Box,
  CreditCard,
  LayoutDashboard,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api, json, useApi } from '@/lib/api';
import { Category, Product, VendorOrder, money } from '@/lib/types';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { Action, Badge, Empty, ErrorBox, Loading, Modal, PageTitle } from '@/components/ui';
import { UploadButton, ProductImageInput } from '@/components/upload';
import { AnalyticsPanel } from '@/components/analytics-panel';
type Vendor = {
  id: string;
  storeName: string;
  slug: string;
  status: string;
  description: string;
  commissionBps: number;
  kyc?: { note?: string };
  balance?: { availableMinor: number; pendingMinor: number };
};
type Stats = {
  products: number;
  orders: number;
  balance: { availableMinor: number; pendingMinor: number };
  recent: VendorOrder[];
  ledger: { id: string; type: string; amountMinor: number; createdAt: string }[];
};
const tabs = [
  ['analytics', 'Analytics', BarChart3],
  ['overview', 'Overview', LayoutDashboard],
  ['products', 'Products', Box],
  ['orders', 'Orders', Package],
  ['earnings', 'Earnings', CreditCard],
  ['verification', 'Verification', ShieldCheck],
  ['settings', 'Store settings', Settings],
  ['team', 'Team', Users],
] as const;
function VendorDashboard() {
  const { user, toast } = useStore(),
    vendor = useApi<Vendor>('/vendor/me'),
    stats = useApi<Stats>('/vendor/stats'),
    products = useApi<Product[]>('/vendor/products'),
    orders = useApi<VendorOrder[]>('/vendor/orders'),
    categories = useApi<Category[]>('/categories'),
    members = useApi<{ id: string; name: string; email: string }[]>(
      user?.role === 'VENDOR_OWNER' ? '/vendor/team' : null,
    ),
    [tab, setTab] = useState('overview'),
    [modal, setModal] = useState<'product' | Product | null>(null),
    [variantProduct, setVariantProduct] = useState<Product | null>(null),
    [kycDocument, setKycDocument] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tracking, setTracking] = useState<Record<string, string>>({});
  const reload = async () => {
    await Promise.all([
      vendor.refresh(),
      stats.refresh(),
      products.refresh(),
      orders.refresh(),
      members.refresh(),
    ]);
  };
  useEffect(() => {
    const update = () => void orders.refresh();
    window.addEventListener('orders-updated', update);
    return () => window.removeEventListener('orders-updated', update);
  }, [orders.refresh]);
  const perform = async (path: string, data: unknown, method = 'POST') => {
    try {
      await api(path, json(data, method));
      toast('Your store is up to date');
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const submit = async (
    e: React.FormEvent<HTMLFormElement>,
    path: string,
    transform?: (f: Record<string, FormDataEntryValue>) => unknown,
    method = 'POST',
  ) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(path, json(transform ? transform(f) : f, method));
      toast('Saved successfully');
      setModal(null);
      setVariantProduct(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (vendor.loading) return <Loading />;
  if (vendor.error)
    return (
      <div className="container page">
        <ErrorBox message={vendor.error} retry={() => void vendor.refresh()} />
      </div>
    );
  const v = vendor.data!;
  const editing = modal && typeof modal === 'object' ? modal : null;
  return (
    <div className="container page">
      <PageTitle
        eyebrow="YOUR STORE, AT A GLANCE"
        title={v.storeName}
        description="Make room for the next good thing."
        action={
          <Link className="button secondary" href={`/shop?vendor=${v.slug}`}>
            View storefront ↗
          </Link>
        }
      />
      <div className="dashboard-status">
        <span>
          <ShieldCheck size={17} /> Store status: <Badge status={v.status} />
        </span>
        <span>{v.commissionBps / 100}% platform commission</span>
      </div>
      <div className="dashboard">
        <aside className="dashboard-nav">
          <span>SELLER WORKSPACE</span>
          {tabs
            .filter(
              ([id]) =>
                user?.role === 'VENDOR_OWNER' ||
                ['overview', 'products', 'orders', 'earnings'].includes(id),
            )
            .map(([id, label, Icon]) => (
              <button
                className={tab === id ? 'active' : ''}
                key={id}
                onClick={() => {
                  setTab(id);
                  setError('');
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
        </aside>
        <div className="dashboard-content">
          {tab === 'analytics' && user?.role === 'VENDOR_OWNER' && <AnalyticsPanel />}
          {tab === 'overview' && (
            <>
              <div className="stats-grid">
                {[
                  [Box, 'Live & draft products', stats.data?.products || 0],
                  [Package, 'Total shipments', stats.data?.orders || 0],
                  [
                    CreditCard,
                    'Available earnings',
                    money(stats.data?.balance?.availableMinor || 0),
                  ],
                  [BarChart3, 'In payout batches', money(stats.data?.balance?.pendingMinor || 0)],
                ].map(([Icon, label, value]) => {
                  const I = Icon as typeof Box;
                  return (
                    <div className="stat" key={String(label)}>
                      <span>
                        <I size={18} />
                        {String(label)}
                      </span>
                      <strong>{value as string | number}</strong>
                    </div>
                  );
                })}
              </div>
              <h2 className="dashboard-section-title">Recent orders</h2>
              {stats.error && <ErrorBox message={stats.error} />}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Shipment</th>
                      <th>Items</th>
                      <th>Status</th>
                      <th>Your earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data?.recent.map((o) => (
                      <tr key={o.id}>
                        <td>#{o.id.slice(-8).toUpperCase()}</td>
                        <td>{o.lines.length} finds</td>
                        <td>
                          <Badge status={o.status} />
                        </td>
                        <td>{money(o.vendorNetMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!stats.data?.recent.length && (
                  <Empty
                    title="Ready for your first order"
                    text="Keep your listings stocked. Your next customer is out there."
                    href={`/shop?vendor=${v.slug}`}
                    label="View store"
                  />
                )}
              </div>
            </>
          )}
          {tab === 'products' && (
            <>
              <div className="section-heading">
                <h2>Your good finds</h2>
                {user?.role === 'VENDOR_OWNER' && (
                  <button
                    disabled={v.status !== 'ACTIVE'}
                    className="button"
                    onClick={() => {
                      setError('');
                      setModal('product');
                    }}
                  >
                    <Plus size={18} />
                    Add product
                  </button>
                )}
              </div>
              {products.error && <ErrorBox message={products.error} />}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Status</th>
                      <th>Price</th>
                      <th>Available / reserved</th>
                      <th>Update stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.data?.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="table-product">
                            <img src={p.image} alt="" />
                            <strong>
                              {p.title}
                              <small>{p.variants[0].sku}</small>
                            </strong>
                          </div>
                        </td>
                        <td>
                          <Badge status={p.status} />
                        </td>
                        <td>{money(p.variants[0].priceMinor)}</td>
                        <td>
                          {p.variants[0].stockQty - p.variants[0].reservedQty} /{' '}
                          {p.variants[0].reservedQty}
                        </td>
                        <td>
                          <form
                            className="table-actions"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void perform(
                                `/vendor/products/${p.variants[0].id}/inventory`,
                                { stockQty: Number(new FormData(e.currentTarget).get('stock')) },
                                'PATCH',
                              );
                            }}
                          >
                            <input
                              type="number"
                              name="stock"
                              aria-label={`Stock for ${p.title}`}
                              defaultValue={p.variants[0].stockQty}
                              min={p.variants[0].reservedQty}
                              max={100000}
                              required
                            />
                            <button className="button secondary">Save</button>
                            {user?.role === 'VENDOR_OWNER' && (
                              <button
                                type="button"
                                className="text-link"
                                onClick={() => {
                                  setError('');
                                  setVariantProduct(p);
                                }}
                              >
                                Variants ({p.variants.length})
                              </button>
                            )}
                            {user?.role === 'VENDOR_OWNER' && (
                              <button
                                type="button"
                                className="text-button muted"
                                onClick={() =>
                                  void perform(`/vendor/products/${p.id}`, {}, 'DELETE')
                                }
                              >
                                Archive
                              </button>
                            )}
                            {user?.role === 'VENDOR_OWNER' && (
                              <button
                                type="button"
                                className="text-link"
                                onClick={() => {
                                  setError('');
                                  setModal(p);
                                }}
                              >
                                Edit details
                              </button>
                            )}
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fine-print">
                New and edited products stay in draft until an administrator approves them. Total
                stock includes reservations.
              </p>
            </>
          )}
          {tab === 'orders' && (
            <>
              <h2 className="dashboard-section-title">Every order, in good hands.</h2>
              {orders.error && <ErrorBox message={orders.error} />}{' '}
              {!orders.data?.length && (
                <Empty
                  title="All quiet for now"
                  text="New orders will appear here, ready for you to prepare."
                />
              )}
              {orders.data?.map((o) => (
                <article className="dashboard-order" key={o.id}>
                  <div className="section-heading">
                    <h3>#{o.id.slice(-8).toUpperCase()}</h3>
                    <Badge status={o.status} />
                  </div>
                  <p>{o.lines.map((l) => `${l.titleSnapshot} × ${l.qty}`).join(' · ')}</p>
                  <strong>
                    {money(o.goodsMinor)} goods · {money(o.vendorNetMinor)} net
                  </strong>
                  {o.order?.shippingAddress && (
                    <p>
                      {o.order.shippingAddress.name} · {o.order.shippingAddress.phone}
                      <br />
                      {o.order.shippingAddress.line1}, {o.order.shippingAddress.city}{' '}
                      {o.order.shippingAddress.postalCode}
                    </p>
                  )}
                  {o.trackingNumber && <small>Tracking: {o.trackingNumber}</small>}
                  <div className="dashboard-order-actions">
                    {o.status === 'AWAITING_FULFILLMENT' && (
                      <Action
                        onClick={() =>
                          perform(`/vendor/orders/${o.id}/status`, { status: 'PROCESSING' })
                        }
                      >
                        Start preparing
                      </Action>
                    )}
                    {o.status === 'PROCESSING' && (
                      <>
                        <input
                          placeholder="Tracking number"
                          aria-label="Tracking number"
                          value={tracking[o.id] || ''}
                          onChange={(e) => setTracking({ ...tracking, [o.id]: e.target.value })}
                        />
                        <Action
                          disabled={!tracking[o.id]}
                          onClick={() =>
                            perform(`/vendor/orders/${o.id}/status`, {
                              status: 'SHIPPED',
                              trackingNumber: tracking[o.id],
                            })
                          }
                        >
                          Mark shipped
                        </Action>
                      </>
                    )}
                    {o.status === 'SHIPPED' && (
                      <Action
                        onClick={() =>
                          perform(`/vendor/orders/${o.id}/status`, { status: 'DELIVERED' })
                        }
                      >
                        Confirm delivery
                      </Action>
                    )}
                    {['AWAITING_FULFILLMENT', 'PROCESSING'].includes(o.status) && (
                      <Action
                        className="button secondary"
                        onClick={() =>
                          perform(`/vendor-orders/${o.id}/cancel`, {
                            reason: 'Vendor unable to fulfill this shipment',
                          })
                        }
                      >
                        Cancel shipment
                      </Action>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
          {tab === 'earnings' && (
            <>
              <h2 className="dashboard-section-title">Good work, accounted for.</h2>
              <div className="stats-grid">
                <div className="stat">
                  <span>Available balance</span>
                  <strong>{money(stats.data?.balance?.availableMinor || 0)}</strong>
                </div>
                <div className="stat">
                  <span>Awaiting payout transfer</span>
                  <strong>{money(stats.data?.balance?.pendingMinor || 0)}</strong>
                </div>
              </div>
              <p className="fine-print" style={{ marginBottom: 20 }}>
                Earnings settle after delivery. Returns can reduce your balance, including after a
                payout. Payouts are prepared and reconciled by the platform.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Date</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data?.ledger.map((l) => (
                      <tr key={l.id}>
                        <td>{l.type.replaceAll('_', ' ')}</td>
                        <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                        <td>{money(l.amountMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'verification' && (
            <section className="panel">
              <h2>A store people can trust.</h2>
              <p>
                Submit your business information and a secure link to your verification document.
                Upload a private verification document or provide a secure link.
              </p>
              {v.kyc?.note && <p className="form-error">Review note: {v.kyc.note}</p>}
              {['APPLIED', 'KYC_PENDING', 'REJECTED'].includes(v.status) ? (
                <form
                  className="form"
                  style={{ marginTop: 22 }}
                  onSubmit={(e) =>
                    void submit(e, '/vendor/kyc', (f) => ({
                      ...f,
                      ...(!f.documentUrl ? { documentUrl: undefined } : {}),
                      ...(kycDocument ? { documentId: kycDocument } : {}),
                    }))
                  }
                >
                  <label>
                    Legal business name
                    <input name="legalName" required minLength={3} maxLength={120} />
                  </label>
                  <label>
                    Trade license / registration
                    <input name="tradeLicense" required minLength={5} maxLength={100} />
                  </label>
                  <label>
                    Secure document URL
                    <input
                      name="documentUrl"
                      type="url"
                      pattern="https://.*"
                      placeholder="https://…"
                      required={!kycDocument}
                    />
                  </label>
                  <UploadButton scope="KYC" onUploaded={(r) => setKycDocument(r.id)} />
                  {kycDocument && (
                    <p className="success-text">Private verification document uploaded.</p>
                  )}
                  {error && <p className="form-error">{error}</p>}
                  <button disabled={busy} className="button">
                    Submit for verification
                  </button>
                </form>
              ) : (
                <p style={{ marginTop: 20 }}>
                  Current verification: <Badge status={v.status} />
                </p>
              )}
            </section>
          )}
          {tab === 'settings' && (
            <section className="panel">
              <h2>A little more you.</h2>
              <form
                className="form"
                onSubmit={(e) =>
                  void submit(
                    e,
                    '/vendor/settings',
                    (f) => ({ ...f, ...(!f.bankDetails ? { bankDetails: undefined } : {}) }),
                    'PATCH',
                  )
                }
              >
                <label>
                  Store name
                  <input
                    name="storeName"
                    defaultValue={v.storeName}
                    minLength={3}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  Your story
                  <textarea
                    name="description"
                    defaultValue={v.description}
                    maxLength={1000}
                    rows={4}
                  />
                </label>
                <label>
                  Payout bank / mobile account details
                  <textarea
                    name="bankDetails"
                    minLength={8}
                    maxLength={500}
                    placeholder="Account holder, bank, account number and routing number"
                    rows={3}
                  />
                  <small>Encrypted at rest. Leave blank to keep current details.</small>
                </label>
                {error && <p className="form-error">{error}</p>}
                <button className="button" disabled={busy}>
                  Save store settings
                </button>
              </form>
            </section>
          )}
          {tab === 'team' && (
            <section className="panel">
              <h2>Good things take a team.</h2>
              <p>
                Invite an existing customer account as store staff. Staff can manage inventory and
                orders for this store.
              </p>
              <form
                className="form"
                style={{ marginTop: 22 }}
                onSubmit={(e) => void submit(e, '/vendor/team')}
              >
                <label>
                  Team member’s email
                  <input type="email" name="email" required />
                </label>
                {error && <p className="form-error">{error}</p>}
                <button className="button" disabled={busy}>
                  Add team member
                </button>
              </form>
              {members.data?.map((member) => (
                <article className="category-rate" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <p>{member.email}</p>
                  </div>
                  <Action
                    className="button secondary"
                    onClick={() => perform(`/vendor/team/${member.id}`, {}, 'DELETE')}
                  >
                    Remove access
                  </Action>
                </article>
              ))}
            </section>
          )}
        </div>
      </div>
      {variantProduct && (
        <Modal title={`Variants · ${variantProduct.title}`} close={() => setVariantProduct(null)}>
          {variantProduct.variants.map((variant) => (
            <form
              className="category-rate"
              key={variant.id}
              onSubmit={(e) => {
                e.preventDefault();
                void perform(
                  `/vendor/products/${variant.id}/inventory`,
                  { stockQty: Number(new FormData(e.currentTarget).get('stock')) },
                  'PATCH',
                );
              }}
            >
              <label>
                {variant.sku} · {Object.values(variant.attrs).join(' / ')}
                <input
                  type="number"
                  min={variant.reservedQty}
                  max={100000}
                  name="stock"
                  defaultValue={variant.stockQty}
                  required
                />
              </label>
              <button className="button secondary">Save stock</button>
            </form>
          ))}
          <h3 style={{ margin: '20px 0' }}>Add a variant</h3>
          <form
            className="form"
            onSubmit={(e) =>
              void submit(e, `/vendor/products/${variantProduct.id}/variants`, (f) => ({
                sku: f.sku,
                priceMinor: Math.round(Number(f.price) * 100),
                stockQty: Number(f.stockQty),
                attrs: Object.fromEntries(
                  [
                    ['Color', f.color],
                    ['Size', f.size],
                    ['Material', f.material],
                  ].filter(([, value]) => !!value),
                ),
              }))
            }
          >
            <label>
              SKU
              <input name="sku" required minLength={3} maxLength={100} />
            </label>
            <div className="form-row">
              <label>
                Price (৳)
                <input name="price" type="number" min="1" step="0.01" required />
              </label>
              <label>
                Stock
                <input name="stockQty" type="number" min="0" max="100000" required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Color
                <input name="color" maxLength={100} />
              </label>
              <label>
                Size
                <input name="size" maxLength={100} />
              </label>
            </div>
            <label>
              Material
              <input name="material" maxLength={100} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button" disabled={busy}>
              Add variant for moderation
            </button>
          </form>
        </Modal>
      )}
      {modal && (
        <Modal
          title={editing ? 'Refine your good find' : 'Introduce a new good find'}
          close={() => setModal(null)}
        >
          <form
            className="form"
            onSubmit={(e) =>
              void submit(
                e,
                editing ? `/vendor/products/${editing.id}` : '/vendor/products',
                (f) => ({
                  ...f,
                  priceMinor: Math.round(Number(f.price) * 100),
                  compareAtMinor: f.compare ? Math.round(Number(f.compare) * 100) : undefined,
                  stockQty: editing ? undefined : Number(f.stockQty),
                  sku: editing ? undefined : f.sku,
                  price: undefined,
                  compare: undefined,
                }),
                editing ? 'PATCH' : 'POST',
              )
            }
          >
            <label>
              Product title
              <input
                name="title"
                defaultValue={editing?.title}
                minLength={3}
                maxLength={180}
                required
              />
            </label>
            <div className="form-row">
              <label>
                URL slug
                <input
                  name="slug"
                  defaultValue={editing?.slug}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  minLength={3}
                  required
                />
              </label>
              <label>
                SKU
                <input
                  name="sku"
                  defaultValue={editing?.variants[0].sku}
                  disabled={!!editing}
                  minLength={3}
                  maxLength={100}
                  required
                />
              </label>
            </div>
            <label>
              Category
              <select name="categoryId" defaultValue={editing?.categoryId}>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={editing?.description}
                required
                minLength={20}
                maxLength={10000}
                rows={4}
              />
            </label>
            <ProductImageInput defaultValue={editing?.image || '/products/01.jpg'} />
            <div className="form-row">
              <label>
                Price (৳)
                <input
                  name="price"
                  defaultValue={editing ? editing.variants[0].priceMinor / 100 : undefined}
                  type="number"
                  step="0.01"
                  min="1"
                  max="1000000"
                  required
                />
              </label>
              <label>
                Original price (৳)
                <input
                  name="compare"
                  defaultValue={
                    editing?.variants[0].compareAtMinor
                      ? editing.variants[0].compareAtMinor / 100
                      : undefined
                  }
                  type="number"
                  step="0.01"
                  min="1"
                  max="1000000"
                />
              </label>
            </div>
            <label>
              Stock quantity
              <input
                name="stockQty"
                defaultValue={editing?.variants[0].stockQty}
                disabled={!!editing}
                type="number"
                min="0"
                max="100000"
                required
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button">
              Save draft for approval
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export default function VendorPage() {
  return (
    <Gate roles={['VENDOR_OWNER', 'VENDOR_STAFF']}>
      <VendorDashboard />
    </Gate>
  );
}
