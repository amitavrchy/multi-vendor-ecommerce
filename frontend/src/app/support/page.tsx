'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, json, useApi } from '@/lib/api';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { Badge, ErrorBox, Loading, PageTitle, Action } from '@/components/ui';
type Case = {
  id: string;
  subject: string;
  status: string;
  resolution?: string;
  vendorOrderId: string;
  messages: {
    id: string;
    authorName: string;
    authorRole: string;
    body: string;
    createdAt: string;
  }[];
};
function Desk() {
  const params = useSearchParams(),
    shipment = params.get('shipment'),
    { user, toast } = useStore(),
    cases = useApi<Case[]>('/disputes'),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [resolution, setResolution] = useState('');
  const active = cases.data?.find((c) => c.id === selected) || cases.data?.[0];
  const staff = ['PLATFORM_ADMIN', 'SUPPORT_AGENT'].includes(user?.role || '');
  return (
    <div className="container page">
      <PageTitle
        eyebrow="A REAL CONVERSATION"
        title="Let’s make things right."
        description="Ask a question, share an update, or work through an order issue together."
      />
      {shipment && (
        <section className="panel" style={{ marginBottom: 25 }}>
          <h2>Open an order support case</h2>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const c = await api<Case>(
                  '/disputes',
                  json({
                    ...Object.fromEntries(new FormData(e.currentTarget)),
                    vendorOrderId: shipment,
                  }),
                );
                setSelected(c.id);
                toast('Your case is open');
                await cases.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Subject
              <input name="subject" required minLength={5} maxLength={120} />
            </label>
            <label>
              How can we help?
              <textarea name="body" required minLength={10} maxLength={4000} rows={3} />
            </label>
            <button className="button" disabled={busy}>
              Open support case
            </button>
          </form>
        </section>
      )}
      {error && <ErrorBox message={error} />}{' '}
      {cases.loading ? (
        <Loading />
      ) : cases.error ? (
        <ErrorBox message={cases.error} />
      ) : (
        <div className="support-layout">
          <aside>
            {cases.data?.length ? (
              cases.data.map((c) => (
                <button
                  className={`support-case ${c.id === active?.id ? 'selected' : ''}`}
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <strong>{c.subject}</strong>
                  <small>Shipment #{c.vendorOrderId.slice(-8)}</small>
                  <Badge status={c.status} />
                </button>
              ))
            ) : (
              <p className="muted">
                No support cases. You can open one from any shipment in My orders.
              </p>
            )}
          </aside>
          {active && (
            <section className="panel">
              <div className="section-heading">
                <h2>{active.subject}</h2>
                <Badge status={active.status} />
              </div>
              <div className="messages">
                {active.messages.map((m) => (
                  <article
                    key={m.id}
                    className={m.authorRole === 'CUSTOMER' ? 'message customer' : 'message'}
                  >
                    <strong>
                      {m.authorName} · {m.authorRole.replaceAll('_', ' ')}
                    </strong>
                    <p>{m.body}</p>
                    <small>{new Date(m.createdAt).toLocaleString()}</small>
                  </article>
                ))}
              </div>
              {active.resolution && <p className="resolution">Resolution: {active.resolution}</p>}
              {active.status === 'OPEN' && (
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    setBusy(true);
                    try {
                      await api(
                        `/disputes/${active.id}/messages`,
                        json({ body: new FormData(form).get('body') }),
                      );
                      form.reset();
                      await cases.refresh();
                    } catch (e) {
                      toast((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Your reply
                    <textarea name="body" required maxLength={4000} rows={3} />
                  </label>
                  <button disabled={busy} className="button">
                    Send reply
                  </button>
                </form>
              )}
              {staff && (
                <div className="case-resolution">
                  <label>
                    Resolution note
                    <input
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      minLength={5}
                      maxLength={2000}
                    />
                  </label>
                  <Action
                    disabled={resolution.trim().length < 5}
                    className="button secondary"
                    onClick={async () => {
                      await api(
                        `/disputes/${active.id}`,
                        json(
                          { status: active.status === 'OPEN' ? 'RESOLVED' : 'OPEN', resolution },
                          'PATCH',
                        ),
                      );
                      await cases.refresh();
                    }}
                  >
                    {active.status === 'OPEN' ? 'Resolve case' : 'Reopen case'}
                  </Action>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
export default function SupportPage() {
  return (
    <Gate>
      <Suspense fallback={<Loading />}>
        <Desk />
      </Suspense>
    </Gate>
  );
}
