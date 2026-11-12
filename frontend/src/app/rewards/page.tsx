'use client';
import { useState } from 'react';
import { api, json, useApi } from '@/lib/api';
import { money, pretty } from '@/lib/types';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { PageTitle, Loading, ErrorBox } from '@/components/ui';
type Rewards = {
  points: number;
  referralCode: string;
  claimed: { status: string } | null;
  referrals: { status: string; _count: { _all: number } }[];
  coupons: { code: string; maxDiscountMinor: number; expiresAt: string }[];
  entries: { id: string; type: string; points: number; createdAt: string }[];
};
function Rewards() {
  const r = useApi<Rewards>('/rewards'),
    { toast } = useStore(),
    [busy, setBusy] = useState(false);
  async function act(path: string, body: unknown) {
    setBusy(true);
    try {
      await api(path, json(body));
      await r.refresh();
      toast('Your rewards are updated');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <PageTitle
        eyebrow="GOOD FINDS. A LITTLE EXTRA GOOD."
        title="Your Bazaar rewards."
        description="Earn 1 point per ৳100 in eligible delivered goods. Redeem 100 points for a personal ৳100 voucher."
      />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : (
        r.data && (
          <>
            <div className="growth-columns">
              <section className="reward-balance panel">
                <span>Available points</span>
                <strong>{r.data.points}</strong>
                <p>
                  Delivery earns points. Returns adjust earned points, even after redemption. A
                  negative balance is recovered by future earnings.
                </p>
                <button
                  className="button"
                  disabled={busy || r.data.points < 100}
                  onClick={() => void act('/rewards/redeem', {})}
                >
                  Redeem 100 points
                </button>
              </section>
              <section className="panel">
                <h2>Good things are better shared.</h2>
                <p>
                  Invite a new shopper with your code. After their first qualifying delivery of
                  ৳1,000 or more, you each receive 100 points. Returns below that threshold reverse
                  the bonus.
                </p>
                <div className="referral-code">
                  <code>{r.data.referralCode}</code>
                  <button
                    className="button secondary"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(r.data!.referralCode)
                        .then(() => toast('Referral code copied'))
                        .catch(() => toast('Select and copy the code manually'))
                    }
                  >
                    Copy code
                  </button>
                </div>
                <p>
                  {r.data.referrals.reduce((s, v) => s + v._count._all, 0)} invitations claimed ·{' '}
                  {r.data.referrals.find((v) => v.status === 'QUALIFIED')?._count._all || 0}{' '}
                  qualified
                </p>
                {!r.data.claimed ? (
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act('/rewards/referral', {
                        code: new FormData(e.currentTarget).get('code'),
                      });
                    }}
                  >
                    <label>
                      Have a friend’s code?
                      <input
                        name="code"
                        minLength={12}
                        maxLength={12}
                        required
                        placeholder="Before your first order"
                      />
                    </label>
                    <button className="button secondary" disabled={busy}>
                      Claim referral
                    </button>
                  </form>
                ) : (
                  <p>Referral: {pretty(r.data.claimed.status)}</p>
                )}
              </section>
            </div>
            <section className="panel">
              <h2>Your personal vouchers</h2>
              <p className="muted">
                One use per voucher, valid for 90 days. Apply at checkout on goods of at least ৳100.
                Vouchers belong to your account and pause while your points balance is negative.
              </p>
              <div className="voucher-grid">
                {r.data.coupons.map((c) => (
                  <article key={c.code}>
                    <strong>{money(c.maxDiscountMinor)} off</strong>
                    <code>{c.code}</code>
                    <small>Expires {new Date(c.expiresAt).toLocaleDateString()}</small>
                    <button
                      className="text-link"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(c.code)
                          .then(() => toast('Voucher copied'))
                          .catch(() => toast('Select and copy the voucher manually'))
                      }
                    >
                      Copy voucher
                    </button>
                  </article>
                ))}
              </div>
              {!r.data.coupons.length && <p>No unused vouchers yet.</p>}
            </section>
            <section className="panel">
              <h2>Points history</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Points</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.data.entries.map((e) => (
                      <tr key={e.id}>
                        <td>{pretty(e.type)}</td>
                        <td>
                          {e.points > 0 ? '+' : ''}
                          {e.points}
                        </td>
                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
export default function Page() {
  return (
    <Gate>
      <Rewards />
    </Gate>
  );
}
