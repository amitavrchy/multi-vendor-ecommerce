'use client';
import { api, json, useApi } from '@/lib/api';
import { Gate } from '@/components/gate';
import { useStore } from '@/components/provider';
import { Loading, PageTitle, Badge } from '@/components/ui';
type Policy = {
  returnWindowDays: number;
  restockingBps: number;
  weeklyPayouts: boolean;
  payoutWeekday: number;
  reviewDelayDays: number;
};
type Coupon = {
  code: string;
  percent: number;
  funding: string;
  active: boolean;
  expiresAt: string;
};
function Settings() {
  const { toast } = useStore(),
    policy = useApi<Policy>('/policies'),
    categories =
      useApi<{ id: string; name: string; commissionBps: number | null }[]>('/admin/categories'),
    coupons = useApi<Coupon[]>('/admin/coupons');
  const save = async (path: string, body: unknown, method = 'PATCH') => {
    try {
      await api(path, json(body, method));
      toast('Marketplace settings saved');
      await Promise.all([policy.refresh(), categories.refresh(), coupons.refresh()]);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (!policy.data) return <Loading />;
  return (
    <div className="container page">
      <PageTitle
        eyebrow="THE RULES BEHIND THE GOOD FINDS"
        title="Marketplace settings."
        description="Set clear return, commission, promotion and payout policies."
      />
      <div className="account-grid">
        <section className="panel">
          <h2>Returns & scheduled jobs</h2>
          <form
            className="form"
            key={JSON.stringify(policy.data)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save('/admin/policies', {
                returnWindowDays: Number(f.get('returnWindowDays')),
                restockingBps: Math.round(Number(f.get('restocking')) * 100),
                reviewDelayDays: Number(f.get('reviewDelayDays')),
                weeklyPayouts: f.has('weeklyPayouts'),
                payoutWeekday: Number(f.get('payoutWeekday')),
              });
            }}
          >
            <label>
              Return window (days)
              <input
                name="returnWindowDays"
                type="number"
                min="1"
                max="90"
                required
                defaultValue={policy.data.returnWindowDays}
              />
            </label>
            <label>
              Restocking fee (%)
              <input
                name="restocking"
                type="number"
                step="0.01"
                min="0"
                max="50"
                required
                defaultValue={policy.data.restockingBps / 100}
              />
            </label>
            <label>
              Review request delay (days)
              <input
                name="reviewDelayDays"
                type="number"
                min="1"
                max="30"
                required
                defaultValue={policy.data.reviewDelayDays}
              />
            </label>
            <label className="checkbox-label">
              <input
                name="weeklyPayouts"
                type="checkbox"
                defaultChecked={policy.data.weeklyPayouts}
              />
              Prepare weekly payout batches
            </label>
            <label>
              Payout weekday
              <select name="payoutWeekday" defaultValue={policy.data.payoutWeekday}>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                  (d, i) => (
                    <option value={i} key={d}>
                      {d}
                    </option>
                  ),
                )}
              </select>
            </label>
            <p className="fine-print">
              Weekly jobs prepare batches in Asia/Dhaka time. Actual external transfers still
              require reconciliation.
            </p>
            <button className="button">Save policies</button>
          </form>
        </section>
        <section className="panel">
          <h2>Category commission overrides</h2>
          {categories.data?.map((c) => (
            <form
              className="category-rate"
              key={c.id}
              onSubmit={(e) => {
                e.preventDefault();
                const value = new FormData(e.currentTarget).get('rate');
                void save(`/admin/categories/${c.id}`, {
                  commissionBps: value === '' ? null : Math.round(Number(value) * 100),
                });
              }}
            >
              <label>
                {c.name}
                <input
                  name="rate"
                  aria-label={`${c.name} commission`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Vendor rate"
                  defaultValue={c.commissionBps === null ? '' : c.commissionBps / 100}
                />
              </label>
              <button className="button secondary">Save</button>
            </form>
          ))}
        </section>
        <section className="panel">
          <h2>Create or update a coupon</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save(
                '/admin/coupons',
                {
                  code: String(f.get('code')).toUpperCase(),
                  percent: Number(f.get('percent')),
                  maxDiscountMinor: Math.round(Number(f.get('max')) * 100),
                  minGoodsMinor: Math.round(Number(f.get('min')) * 100),
                  funding: f.get('funding'),
                  expiresAt: new Date(String(f.get('expiresAt'))).toISOString(),
                  active: f.has('active'),
                },
                'POST',
              );
            }}
          >
            <label>
              Coupon code
              <input name="code" required minLength={3} maxLength={40} />
            </label>
            <div className="form-row">
              <label>
                Discount (%)
                <input name="percent" type="number" min="1" max="100" required />
              </label>
              <label>
                Maximum discount (৳)
                <input name="max" type="number" min="0" required />
              </label>
            </div>
            <label>
              Minimum goods value (৳)
              <input name="min" type="number" min="0" defaultValue="0" required />
            </label>
            <label>
              Who funds the discount?
              <select name="funding">
                <option value="PLATFORM">Platform</option>
                <option value="VENDOR">Vendor (allocated across shipments)</option>
              </select>
            </label>
            <label>
              Expires at
              <input name="expiresAt" type="datetime-local" required />
            </label>
            <label className="checkbox-label">
              <input name="active" type="checkbox" defaultChecked />
              Active
            </label>
            <button className="button">Save coupon</button>
          </form>
        </section>
        <section className="panel">
          <h2>Current promotions</h2>
          {coupons.data?.map((c) => (
            <article className="audit-event" key={c.code}>
              <strong>
                {c.code} · {c.percent}%
              </strong>
              <p>
                {c.funding} funded · expires {new Date(c.expiresAt).toLocaleDateString()}
              </p>
              <Badge status={c.active ? 'ACTIVE' : 'DISABLED'} />
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
export default function PolicyPage() {
  return (
    <Gate roles={['PLATFORM_ADMIN']}>
      <Settings />
    </Gate>
  );
}
