'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, json } from '@/lib/api';
import { NewsletterSignup } from '@/components/growth-tools';
import { PageTitle, Loading } from '@/components/ui';
function Newsletter() {
  const search = useSearchParams(),
    confirm = search.get('confirm'),
    unsubscribe = search.get('unsubscribe'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const token = confirm || unsubscribe;
  return (
    <div className="container page">
      <PageTitle
        eyebrow="ONLY THE OCCASIONAL GOOD THING"
        title={unsubscribe ? 'Make a little room in your inbox.' : 'Stay close to the good finds.'}
        description="You control your subscription. We send marketplace updates only after confirmation."
      />
      {token ? (
        <section className="panel">
          <h2>
            {unsubscribe
              ? 'Unsubscribe from marketplace emails'
              : 'Confirm your email subscription'}
          </h2>
          <p>
            {unsubscribe
              ? 'Order and account notifications will continue when needed.'
              : 'Choose Confirm to receive curated finds and marketplace offers.'}
          </p>
          <button
            className="button"
            disabled={busy || !!message}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api(`/marketing/${unsubscribe ? 'unsubscribe' : 'confirm'}`, json({ token }));
                setMessage(
                  unsubscribe
                    ? 'You’re unsubscribed from marketplace updates.'
                    : 'You’re subscribed. Welcome to the good finds.',
                );
              } catch (e) {
                setError('This link is invalid or expired. Request a fresh confirmation email.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {unsubscribe ? 'Unsubscribe' : 'Confirm subscription'}
          </button>
          {message && (
            <p role="status" className="success-text">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </section>
      ) : (
        <NewsletterSignup />
      )}
    </div>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Newsletter />
    </Suspense>
  );
}
