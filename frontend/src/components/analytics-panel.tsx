'use client';
import { useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { useApi } from '@/lib/api';
import { money } from '@/lib/types';
import { ErrorBox, Loading } from './ui';
type Report = {
  days: number;
  series: { day: string; orders: number; salesMinor: number }[];
  summary: {
    orders: number;
    salesMinor: number;
    delivered: number;
    cancelled: number;
    netEarnedMinor: number;
    followers: number;
  };
  lowStock: {
    id: string;
    sku: string;
    stockQty: number;
    reservedQty: number;
    product: { title: string };
  }[];
  topProducts: { variantId: string; title: string; units: number; salesMinor: number }[];
};
export function AnalyticsPanel() {
  const [days, setDays] = useState(30),
    report = useApi<Report>(`/vendor/analytics?days=${days}`);
  if (report.error) return <ErrorBox message={report.error} />;
  const r = report.data,
    max = Math.max(1, ...(r?.series.map((d) => d.salesMinor) || []));
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR STORE, IN FOCUS</p>
          <h2>Business intelligence</h2>
        </div>
        <label>
          Reporting window
          <select
            aria-label="Reporting window"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>
      {report.loading ? (
        <Loading />
      ) : (
        r && (
          <>
            <div className="stats-grid">
              {[
                ['Booked sales', money(r.summary.salesMinor)],
                ['Net ledger earnings', money(r.summary.netEarnedMinor)],
                ['Paid / COD orders', r.summary.orders],
                ['Store followers', r.summary.followers],
              ].map(([label, value]) => (
                <div className="stat" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <section className="panel">
              <div className="section-heading">
                <h3>
                  <TrendingUp size={20} />
                  Daily booked sales
                </h3>
                <button
                  className="button secondary"
                  onClick={() => {
                    const csv =
                      'Date,Orders,Sales (BDT)\n' +
                      r.series
                        .map((d) => `${d.day},${d.orders},${(d.salesMinor / 100).toFixed(2)}`)
                        .join('\n');
                    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `bazaar-sales-${days}-days.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={17} />
                  Export CSV
                </button>
              </div>
              <div
                className="analytics-chart"
                role="img"
                aria-label={`Daily sales over ${days} days, total ${money(r.summary.salesMinor)}`}
              >
                {r.series.map((d) => (
                  <div
                    key={d.day}
                    className="analytics-bar-wrap"
                    title={`${d.day}: ${money(d.salesMinor)} · ${d.orders} orders`}
                  >
                    <span style={{ height: `${Math.max(1, (d.salesMinor / max) * 100)}%` }} />
                    <small>{days <= 30 ? d.day.slice(-2) : ''}</small>
                  </div>
                ))}
              </div>
              <p className="muted">
                Asia/Dhaka dates. Booked sales include confirmed COD and paid shipments, exclude
                cancelled/pending orders, and are shown before returns. Net earnings use delivery
                credits and refund clawbacks.
              </p>
              <details>
                <summary>View accessible daily data</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Orders</th>
                        <th>Booked sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.series.map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td>{d.orders}</td>
                          <td>{money(d.salesMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <div className="account-grid">
              <section className="panel">
                <h3>Best-selling variants</h3>
                {r.topProducts.length ? (
                  r.topProducts.map((p) => (
                    <div className="analytics-row" key={p.variantId}>
                      <span>
                        {p.title}
                        <small>{p.units} units</small>
                      </span>
                      <strong>{money(p.salesMinor)}</strong>
                    </div>
                  ))
                ) : (
                  <p>No confirmed sales in this window.</p>
                )}
              </section>
              <section className="panel">
                <h3>Inventory watchlist</h3>
                {r.lowStock.length ? (
                  r.lowStock.map((p) => (
                    <div className="analytics-row" key={p.id}>
                      <span>
                        {p.product.title}
                        <small>{p.sku}</small>
                      </span>
                      <strong>{p.stockQty - p.reservedQty} left</strong>
                    </div>
                  ))
                ) : (
                  <p>Active products are comfortably stocked.</p>
                )}
              </section>
            </div>
          </>
        )
      )}
    </>
  );
}
