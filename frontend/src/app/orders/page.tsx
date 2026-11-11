'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Package, Truck } from 'lucide-react';
import { api, json, useApi } from '@/lib/api';
import { Order, VendorOrder, money, pretty } from '@/lib/types';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { Action, Badge, Empty, ErrorBox, Loading, Modal, PageTitle } from '@/components/ui';
function Orders() {
  const result = useApi<Order[]>('/orders'),
    { toast } = useStore(),
    [modal, setModal] = useState<{
      kind: 'return' | 'review' | 'cancel';
      vo: VendorOrder;
      order: Order;
    } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => void result.refresh();
    window.addEventListener('orders-updated', update);
    return () => window.removeEventListener('orders-updated', update);
  }, [result.refresh]);
  return (
    <div className="container page">
      <PageTitle
        eyebrow="FROM OUR STORES TO YOUR DOOR"
        title="Your good finds, on their way."
        description="Follow every little step. Each store ships your finds separately."
      />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorBox message={result.error} retry={() => void result.refresh()} />
      ) : !result.data?.length ? (
        <Empty
          title="Your next story starts with a find"
          text="Your orders will appear here once you’ve found something you love."
        />
      ) : (
        <div className="orders-list">
          {result.data.map((o) => (
            <section className="panel order-card" key={o.id}>
              <div className="order-header">
                <div>
                  <strong>Order #{o.id.slice(-8).toUpperCase()}</strong>
                  <p className="muted">
                    {new Date(o.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}{' '}
                    · {o.payment.provider} · {pretty(o.payment.status)}
                  </p>
                </div>
                <Badge status={o.status} />
                <strong>{money(o.grandMinor)}</strong>
              </div>
              {o.status === 'PENDING_PAYMENT' && (
                <div className="payment-pending">
                  <p>Your items are reserved for up to 15 minutes.</p>
                  {o.payment.raw?.redirectUrl && (
                    <a className="button" href={o.payment.raw.redirectUrl}>
                      Continue payment
                    </a>
                  )}
                  <Action
                    className="button secondary"
                    onClick={async () => {
                      try {
                        await api(`/orders/${o.id}/cancel-payment`, json({}));
                        await result.refresh();
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    }}
                  >
                    Cancel payment
                  </Action>
                </div>
              )}
              {o.vendorOrders.map((vo) => (
                <div className="shipment" key={vo.id}>
                  <div className="section-heading">
                    <h3>
                      <Package size={19} />
                      {vo.vendor.storeName}
                    </h3>
                    <Badge status={vo.status} />
                  </div>
                  {vo.status !== 'CANCELLED' && vo.status !== 'PENDING_PAYMENT' && (
                    <div className="order-track">
                      {['AWAITING_FULFILLMENT', 'PROCESSING', 'SHIPPED', 'DELIVERED'].map(
                        (s, i) => (
                          <span
                            key={s}
                            className={
                              [
                                'AWAITING_FULFILLMENT',
                                'PROCESSING',
                                'SHIPPED',
                                'DELIVERED',
                              ].indexOf(vo.status) >= i
                                ? 'done'
                                : ''
                            }
                          >
                            <CheckCircle2 size={18} />
                            {pretty(s)}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {vo.lines.map((l) => (
                    <div className="checkout-item" key={l.id}>
                      <img src={l.imageSnapshot} alt="" />
                      <div>
                        <strong>{l.titleSnapshot}</strong>
                        <small>Qty {l.qty}</small>
                      </div>
                      <span>{money(l.unitPriceMinor * l.qty)}</span>
                    </div>
                  ))}
                  {vo.trackingNumber && (
                    <p className="tracking">
                      <Truck size={18} /> Tracking: <strong>{vo.trackingNumber}</strong>
                    </p>
                  )}
                  <div className="shipment-actions">
                    {['AWAITING_FULFILLMENT', 'PROCESSING'].includes(vo.status) && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setError('');
                          setModal({ kind: 'cancel', vo, order: o });
                        }}
                      >
                        Cancel shipment
                      </button>
                    )}
                    {vo.status === 'DELIVERED' && (
                      <>
                        <button
                          className="button secondary"
                          onClick={() => {
                            setError('');
                            setModal({ kind: 'review', vo, order: o });
                          }}
                        >
                          Share a review
                        </button>
                        {!vo.returns.length && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setError('');
                              setModal({ kind: 'return', vo, order: o });
                            }}
                          >
                            Request a return
                          </button>
                        )}
                      </>
                    )}
                    {vo.returns.map((r) => (
                      <span key={r.id}>
                        Return: <Badge status={r.status} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.kind === 'return'
              ? 'Let’s make it right'
              : modal.kind === 'cancel'
                ? 'Cancel this shipment?'
                : 'Share your good find'
          }
          close={() => setModal(null)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                if (modal.kind === 'return')
                  await api(
                    '/returns',
                    json({ vendorOrderId: modal.vo.id, reason: f.get('body') }),
                  );
                else if (modal.kind === 'cancel')
                  await api(
                    `/vendor-orders/${modal.vo.id}/cancel`,
                    json({ reason: f.get('body') }),
                  );
                else
                  await api(
                    '/reviews',
                    json({
                      productId: f.get('productId'),
                      orderId: modal.order.id,
                      rating: Number(f.get('rating')),
                      body: f.get('body'),
                    }),
                  );
                toast('Your request has been saved');
                setModal(null);
                await result.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {modal.kind === 'review' && (
              <>
                <label>
                  Which find?
                  <select name="productId">
                    {modal.vo.lines.map((l) => (
                      <option
                        key={l.id}
                        value={
                          (l as typeof l & { variant: { productId: string } }).variant?.productId
                        }
                      >
                        {l.titleSnapshot}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Your rating
                  <select name="rating">
                    <option value="5">5 — Love it</option>
                    <option value="4">4 — Really good</option>
                    <option value="3">3 — It’s okay</option>
                    <option value="2">2 — Could be better</option>
                    <option value="1">1 — Disappointed</option>
                  </select>
                </label>
              </>
            )}
            <label>
              {modal.kind === 'review' ? 'Tell us a little more' : 'How can we help?'}
              <textarea
                name="body"
                required
                minLength={modal.kind === 'cancel' ? 5 : 10}
                maxLength={modal.kind === 'review' ? 2000 : 500}
                rows={4}
              />
            </label>
            {modal.kind === 'return' && (
              <p className="fine-print">
                Returns cover the full store shipment within 14 days of delivery. Original shipping
                is non-refundable.
              </p>
            )}
            {modal.kind === 'cancel' && (
              <p className="fine-print">
                This cancels only this store’s shipment. Prepaid amounts are queued for refund.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? 'Saving…' : 'Submit request'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export default function OrdersPage() {
  return (
    <Gate>
      <Orders />
    </Gate>
  );
}
