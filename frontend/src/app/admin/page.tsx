'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Box,
  CreditCard,
  LayoutDashboard,
  Package,
  RotateCcw,
  ScrollText,
  Store,
  Users,
} from 'lucide-react';
import { api, json, useApi } from '@/lib/api';
import { Product, Order, money } from '@/lib/types';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { Action, Badge, ErrorBox, Loading, Modal, PageTitle } from '@/components/ui';
type AdminVendor = {
  id: string;
  storeName: string;
  status: string;
  commissionBps: number;
  owner: { email: string };
  kyc?: { documents: Record<string, string> };
  balance?: { availableMinor: number };
};
type Rma = {
  id: string;
  status: string;
  reason: string;
  vendorOrder: {
    id: string;
    vendor: { storeName: string };
    lines: { titleSnapshot: string; qty: number }[];
  };
};
type Refund = {
  id: string;
  status: string;
  amountMinor: number;
  reason: string;
  providerRef: string;
};
type Batch = {
  id: string;
  status: string;
  scheduledFor: string;
  items: { id: string; amountMinor: number; vendorOrder: { vendor: { storeName: string } } }[];
};
const tabs = [
  ['overview', 'Overview', LayoutDashboard],
  ['vendors', 'Stores & KYC', Store],
  ['products', 'Catalog', Box],
  ['orders', 'Orders', Package],
  ['returns', 'Returns & refunds', RotateCcw],
  ['payouts', 'Payouts', CreditCard],
  ['events', 'Operations', ScrollText],
] as const;
function AdminDashboard() {
  const { user, toast } = useStore(),
    [tab, setTab] = useState('overview'),
    [modal, setModal] = useState<{ kind: 'payout' | 'refund'; id: string } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const overview = useApi<{
      users: number;
      vendors: number;
      orders: number;
      salesMinor: number;
      pendingKyc: number;
      pendingProducts: number;
    }>('/admin/overview'),
    vendors = useApi<AdminVendor[]>(user?.role === 'PLATFORM_ADMIN' ? '/admin/vendors' : null),
    products = useApi<Product[]>(user?.role === 'PLATFORM_ADMIN' ? '/admin/products' : null),
    orders = useApi<(Order & { user: { name: string; email: string } })[]>('/admin/orders'),
    returns = useApi<Rma[]>('/admin/returns'),
    refunds = useApi<Refund[]>('/admin/refunds'),
    payouts = useApi<Batch[]>(user?.role === 'PLATFORM_ADMIN' ? '/payouts' : null),
    payoutAccounts = useApi<{ storeName: string; amountMinor: number; bankDetails: string }[]>(
      modal?.kind === 'payout' ? `/payouts/${modal.id}/instructions` : null,
    ),
    events =
      useApi<
        { id: string; type: string; attempts: number; lastError?: string; payload: unknown }[]
      >('/admin/events');
  const reload = async () => {
    await Promise.all([
      overview.refresh(),
      vendors.refresh(),
      products.refresh(),
      orders.refresh(),
      returns.refresh(),
      refunds.refresh(),
      payouts.refresh(),
      events.refresh(),
    ]);
  };
  const perform = async (path: string, data: unknown, method = 'POST') => {
    try {
      await api(path, json(data, method));
      toast('Updated successfully');
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="container page">
      <PageTitle
        eyebrow="THE BIGGER PICTURE"
        title="Keep the good things growing."
        description="Your marketplace, with every detail in view."
        action={
          <div className="table-actions">
            <Link className="button secondary" href="/support">
              Support desk
            </Link>
            {user?.role === 'PLATFORM_ADMIN' && (
              <Link className="button secondary" href="/admin/settings">
                Marketplace settings
              </Link>
            )}
          </div>
        }
      />
      <div className="dashboard">
        <aside className="dashboard-nav">
          <span>PLATFORM WORKSPACE</span>
          {tabs
            .filter(
              ([id]) =>
                user?.role === 'PLATFORM_ADMIN' ||
                ['overview', 'orders', 'returns', 'events'].includes(id),
            )
            .map(([id, label, Icon]) => (
              <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>
                <Icon size={18} />
                {label}
              </button>
            ))}
        </aside>
        <div className="dashboard-content">
          {tab === 'overview' && (
            <>
              {overview.loading ? (
                <Loading />
              ) : overview.error ? (
                <ErrorBox message={overview.error} />
              ) : (
                <>
                  <div className="stats-grid">
                    {[
                      [Users, 'Customers & team', overview.data?.users || 0],
                      [Store, 'Independent stores', overview.data?.vendors || 0],
                      [Package, 'Marketplace orders', overview.data?.orders || 0],
                      [CreditCard, 'Order value', money(overview.data?.salesMinor || 0)],
                    ].map(([Icon, label, value]) => {
                      const I = Icon as typeof Store;
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
                  <section className="panel">
                    <h2>A little attention goes a long way.</h2>
                    <p>
                      {overview.data?.pendingKyc} seller applications await verification.{' '}
                      {overview.data?.pendingProducts} products are ready for moderation.
                    </p>
                    <p style={{ marginTop: 15 }}>
                      Cash on delivery is active. Merchant gateways only become selectable after
                      valid configuration. Refunds and payout batches show their actual
                      reconciliation state.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
          {tab === 'vendors' && (
            <>
              <h2 className="dashboard-section-title">The people behind the finds.</h2>
              {vendors.error && <ErrorBox message={vendors.error} />}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Store / KYC</th>
                      <th>Status</th>
                      <th>Commission</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.data?.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <strong>{v.storeName}</strong>
                          <small>{v.owner.email}</small>
                          {v.kyc && (
                            <details>
                              <summary>Verification details</summary>
                              {Object.entries(v.kyc.documents).map(([k, value]) => (
                                <p key={k}>
                                  {k}:{' '}
                                  {k === 'documentId' ? (
                                    <a
                                      className="text-link"
                                      href={`/api/uploads/${value}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      View private document ↗
                                    </a>
                                  ) : k === 'documentUrl' ? (
                                    <a
                                      className="text-link"
                                      href={value}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Open document ↗
                                    </a>
                                  ) : (
                                    value
                                  )}
                                </p>
                              ))}
                            </details>
                          )}
                        </td>
                        <td>
                          <Badge status={v.status} />
                        </td>
                        <td>
                          <form
                            className="table-actions"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void perform(
                                `/admin/vendors/${v.id}`,
                                {
                                  status: v.status,
                                  commissionBps: Math.round(
                                    Number(new FormData(e.currentTarget).get('rate')) * 100,
                                  ),
                                },
                                'PATCH',
                              );
                            }}
                          >
                            <input
                              aria-label={`Commission for ${v.storeName}`}
                              name="rate"
                              defaultValue={v.commissionBps / 100}
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                            />
                            <span>%</span>
                            <button className="button secondary">Save</button>
                          </form>
                        </td>
                        <td>
                          <div className="table-actions">
                            {v.status !== 'ACTIVE' && v.kyc && (
                              <Action
                                className="button"
                                onClick={() =>
                                  perform(`/admin/vendors/${v.id}`, { status: 'ACTIVE' }, 'PATCH')
                                }
                              >
                                Approve
                              </Action>
                            )}
                            {v.status === 'ACTIVE' && (
                              <Action
                                className="button secondary"
                                onClick={() =>
                                  perform(
                                    `/admin/vendors/${v.id}`,
                                    { status: 'SUSPENDED', note: 'Suspended by platform review' },
                                    'PATCH',
                                  )
                                }
                              >
                                Suspend
                              </Action>
                            )}
                            {v.status === 'KYC_PENDING' && (
                              <Action
                                className="button secondary"
                                onClick={() =>
                                  perform(
                                    `/admin/vendors/${v.id}`,
                                    {
                                      status: 'REJECTED',
                                      note: 'Please check and resubmit your business information',
                                    },
                                    'PATCH',
                                  )
                                }
                              >
                                Reject
                              </Action>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'products' && (
            <>
              <h2 className="dashboard-section-title">Good finds, held to a standard.</h2>
              {products.error && <ErrorBox message={products.error} />}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Store</th>
                      <th>Status</th>
                      <th>Moderation</th>
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
                              <small>{money(p.variants[0].priceMinor)}</small>
                            </strong>
                          </div>
                        </td>
                        <td>{p.vendor.storeName}</td>
                        <td>
                          <Badge status={p.status} />
                        </td>
                        <td>
                          <div className="table-actions">
                            {p.status !== 'ACTIVE' && (
                              <Action
                                onClick={() =>
                                  perform(`/admin/products/${p.id}`, { status: 'ACTIVE' }, 'PATCH')
                                }
                              >
                                Publish
                              </Action>
                            )}
                            {p.status === 'ACTIVE' ? (
                              <Action
                                className="button secondary"
                                onClick={() =>
                                  perform(`/admin/products/${p.id}`, { status: 'DRAFT' }, 'PATCH')
                                }
                              >
                                Unpublish
                              </Action>
                            ) : (
                              <Action
                                className="button secondary"
                                onClick={() =>
                                  perform(
                                    `/admin/products/${p.id}`,
                                    { status: 'REJECTED' },
                                    'PATCH',
                                  )
                                }
                              >
                                Reject
                              </Action>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'orders' && (
            <>
              <h2 className="dashboard-section-title">Every order tells a story.</h2>
              {orders.error && <ErrorBox message={orders.error} />}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Stores</th>
                      <th>Payment</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.data?.map((o) => (
                      <tr key={o.id}>
                        <td>
                          #{o.id.slice(-8).toUpperCase()}
                          <small>{new Date(o.createdAt).toLocaleDateString()}</small>
                        </td>
                        <td>
                          {o.user.name}
                          <small>{o.user.email}</small>
                        </td>
                        <td>
                          {o.vendorOrders.map((v) => (
                            <small key={v.id}>
                              {v.vendor.storeName}: {v.status}
                            </small>
                          ))}
                        </td>
                        <td>
                          {o.payment.provider}
                          <small>{o.payment.status}</small>
                        </td>
                        <td>{money(o.grandMinor)}</td>
                        <td>
                          <Badge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'returns' && (
            <>
              <h2 className="dashboard-section-title">Make things right.</h2>
              {returns.error && <ErrorBox message={returns.error} />}{' '}
              {!returns.data?.length && (
                <p className="muted" style={{ marginBottom: 24 }}>
                  No return requests right now.
                </p>
              )}
              {returns.data?.map((r) => (
                <section className="dashboard-order" key={r.id}>
                  <div className="section-heading">
                    <h3>
                      {r.vendorOrder.vendor.storeName} · #{r.vendorOrder.id.slice(-8).toUpperCase()}
                    </h3>
                    <Badge status={r.status} />
                  </div>
                  <p>
                    {r.vendorOrder.lines.map((l) => `${l.titleSnapshot} × ${l.qty}`).join(', ')}
                  </p>
                  <p>{r.reason}</p>
                  <div className="table-actions">
                    {r.status === 'REQUESTED' && (
                      <>
                        <Action
                          onClick={() =>
                            perform(`/returns/${r.id}`, { status: 'APPROVED' }, 'PATCH')
                          }
                        >
                          Approve return
                        </Action>
                        <Action
                          className="button secondary"
                          onClick={() =>
                            perform(
                              `/returns/${r.id}`,
                              { status: 'REJECTED', note: 'Return is not eligible' },
                              'PATCH',
                            )
                          }
                        >
                          Reject
                        </Action>
                      </>
                    )}
                    {r.status === 'APPROVED' && (
                      <Action
                        onClick={() =>
                          perform(`/returns/${r.id}`, { status: 'ITEM_RECEIVED' }, 'PATCH')
                        }
                      >
                        Confirm item received
                      </Action>
                    )}
                  </div>
                </section>
              ))}
              <h2 className="dashboard-section-title">Refund reconciliation</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Refund</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.data?.map((r) => (
                      <tr key={r.id}>
                        <td>
                          #{r.id.slice(-8)}
                          <small>{r.reason}</small>
                        </td>
                        <td>{money(r.amountMinor)}</td>
                        <td>
                          <Badge status={r.status} />
                        </td>
                        <td>
                          {r.status === 'MANUAL_REVIEW' && user?.role === 'PLATFORM_ADMIN' && (
                            <button
                              className="button secondary"
                              onClick={() => {
                                setError('');
                                setModal({ kind: 'refund', id: r.id });
                              }}
                            >
                              Confirm transfer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'payouts' && (
            <>
              <div className="section-heading">
                <h2>Good work. Fairly paid.</h2>
                <Action onClick={() => perform('/payouts/run', {})}>Prepare payout batch</Action>
              </div>
              <p className="fine-print" style={{ marginBottom: 22 }}>
                Batches reserve available earnings. Complete the external bank/mobile transfer
                before confirming the batch here. No money is moved automatically.
              </p>
              {payouts.error && <ErrorBox message={payouts.error} />}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Stores / shipments</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Reconcile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.data?.map((p) => (
                      <tr key={p.id}>
                        <td>
                          #{p.id.slice(-8)}
                          <small>{new Date(p.scheduledFor).toLocaleDateString()}</small>
                        </td>
                        <td>
                          {p.items.map((i) => (
                            <small key={i.id}>
                              {i.vendorOrder.vendor.storeName} · {money(i.amountMinor)}
                            </small>
                          ))}
                        </td>
                        <td>{money(p.items.reduce((s, i) => s + i.amountMinor, 0))}</td>
                        <td>
                          <Badge status={p.status} />
                        </td>
                        <td>
                          {p.status === 'OPEN' && (
                            <button
                              className="button secondary"
                              onClick={() => {
                                setError('');
                                setModal({ kind: 'payout', id: p.id });
                              }}
                            >
                              Confirm transfer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'events' && (
            <>
              <div className="section-heading">
                <h2>Behind the scenes</h2>
                <Action className="button secondary" onClick={() => events.refresh()}>
                  Refresh events
                </Action>
              </div>
              <p className="fine-print" style={{ marginBottom: 20 }}>
                Pending outbox events retry every 10 seconds, up to 20 attempts. Gateway webhooks
                are verified and deduplicated before processing. Late payments require operator
                review.
              </p>
              {!events.data?.length && (
                <section className="panel">
                  <h2>All caught up.</h2>
                  <p>No pending outbox events.</p>
                </section>
              )}
              {events.data?.map((e) => (
                <article className="audit-event" key={e.id}>
                  <strong>{e.type}</strong> · {e.attempts} attempts
                  <pre>{JSON.stringify(e.payload, null, 2)}</pre>
                  {e.lastError && <p className="form-error">{e.lastError}</p>}
                  {user?.role === 'PLATFORM_ADMIN' && (
                    <Action
                      className="button secondary"
                      onClick={() => perform(`/admin/events/${e.id}/retry`, {})}
                    >
                      Retry event
                    </Action>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </div>
      {modal && (
        <Modal title="Confirm the completed transfer" close={() => setModal(null)}>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(
                  modal.kind === 'payout'
                    ? `/payouts/${modal.id}/confirm`
                    : `/returns/refunds/${modal.id}/confirm`,
                  json(Object.fromEntries(new FormData(e.currentTarget))),
                );
                setModal(null);
                toast('Transfer recorded');
                await reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="muted">Only confirm after the actual external transfer has completed.</p>
            {modal.kind === 'payout' && (
              <>
                {payoutAccounts.loading ? (
                  <Loading />
                ) : payoutAccounts.error ? (
                  <ErrorBox message={payoutAccounts.error} />
                ) : (
                  payoutAccounts.data?.map((account, i) => (
                    <section className="audit-event" key={i}>
                      <strong>
                        {account.storeName} · {money(account.amountMinor)}
                      </strong>
                      <pre>{account.bankDetails}</pre>
                    </section>
                  ))
                )}
              </>
            )}
            <label>
              Bank / mobile transfer reference
              <input name="transferReference" minLength={5} maxLength={150} required />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button" disabled={busy}>
              Record completed transfer
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export default function AdminPage() {
  return (
    <Gate roles={['PLATFORM_ADMIN', 'SUPPORT_AGENT']}>
      <AdminDashboard />
    </Gate>
  );
}
