'use client';
import { useState } from 'react';
import { api, json, useApi } from '@/lib/api';
import { useStore } from './provider';
import { Badge, Loading, ErrorBox } from './ui';
export function MarketingPanel() {
  const campaigns = useApi<
      {
        id: string;
        title: string;
        body: string;
        status: string;
        audience: string;
        scheduledAt: string | null;
        delivered: number;
        _count: { events: number };
      }[]
    >('/marketing/campaigns'),
    audience = useApi<{ confirmed: number; business: number }>('/marketing/audience'),
    { toast } = useStore(),
    [busy, setBusy] = useState(false);
  async function act(path: string, data: unknown) {
    setBusy(true);
    try {
      await api(path, json(data));
      await campaigns.refresh();
      toast('Campaign updated');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Consent-based campaigns</h2>
        <p>
          {audience.data?.confirmed || 0} confirmed subscribers · {audience.data?.business || 0}{' '}
          verified business subscribers
        </p>
        <p className="muted">
          Only confirmed subscribers receive campaigns. Unsubscribes and cancellations are checked
          again before delivery. Delivery counts reflect successful email receipts.
        </p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void act('/marketing/campaigns', Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <label>
            Campaign subject
            <input name="title" minLength={5} maxLength={150} required />
          </label>
          <label>
            Message
            <textarea name="body" minLength={20} maxLength={5000} rows={5} required />
          </label>
          <label>
            Audience
            <select name="audience">
              <option value="ALL">All confirmed subscribers</option>
              <option value="BUSINESS">Verified business subscribers</option>
            </select>
          </label>
          <button className="button" disabled={busy}>
            Create draft
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Campaigns</h2>
        {campaigns.loading ? (
          <Loading />
        ) : campaigns.error ? (
          <ErrorBox message={campaigns.error} />
        ) : (
          campaigns.data?.map((c) => (
            <article className="growth-record" key={c.id}>
              <div className="section-heading">
                <h3>{c.title}</h3>
                <Badge status={c.status} />
              </div>
              <p>{c.body}</p>
              <p>
                {c.audience === 'BUSINESS' ? 'Business audience' : 'All subscribers'} ·{' '}
                {c._count.events} queued · {c.delivered} delivered
              </p>
              {c.scheduledAt && <p>Scheduled: {new Date(c.scheduledAt).toLocaleString()}</p>}
              {['DRAFT', 'SCHEDULED'].includes(c.status) && (
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = new FormData(e.currentTarget).get('when') as string;
                    void act(
                      `/marketing/campaigns/${c.id}/schedule`,
                      value ? { scheduledAt: new Date(value).toISOString() } : {},
                    );
                  }}
                >
                  <label>
                    Schedule time (optional)
                    <input name="when" type="datetime-local" />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Queue campaign
                  </button>
                </form>
              )}
              {!['CANCELLED'].includes(c.status) && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => void act(`/marketing/campaigns/${c.id}/cancel`, {})}
                >
                  Cancel remaining delivery
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}
