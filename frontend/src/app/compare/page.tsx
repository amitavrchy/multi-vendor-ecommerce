'use client';
import Link from 'next/link';
import { X, ShoppingBag } from 'lucide-react';
import { useStore } from '@/components/provider';
import { useApi } from '@/lib/api';
import { Product, money } from '@/lib/types';
import { Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';
export default function Compare() {
  const { comparison, toggleCompare, add } = useStore();
  const { data, loading, error } = useApi<Product[]>(`/wishlist?ids=${comparison.join(',')}`);
  const products = comparison
    .map((id) => data?.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const attrs = [...new Set(products.flatMap((p) => Object.keys(p.variants[0].attrs)))];
  return (
    <div className="container page">
      <PageTitle
        eyebrow="THE DETAILS MAKE THE DIFFERENCE"
        title="Find your better fit."
        description="Compare up to four finds side by side. Prices and availability update from the marketplace."
        action={
          <Link className="button secondary" href="/shop">
            Add more finds →
          </Link>
        }
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !products.length ? (
        <Empty
          title="Give your favourites a fair comparison"
          text="Choose Compare on a product to bring its details here."
        />
      ) : (
        <div className="compare-scroll">
          <table className="comparison-table">
            <caption className="sr-only">Side-by-side product comparison</caption>
            <thead>
              <tr>
                <th scope="col">Your shortlist</th>
                {products.map((p) => (
                  <th scope="col" key={p.id}>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${p.title} from comparison`}
                      onClick={() => toggleCompare(p.id)}
                    >
                      <X size={18} />
                    </button>
                    <Link href={`/product/${p.slug}`}>
                      <img src={p.image} alt={p.title} />
                      <h2>{p.title}</h2>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Price from</th>
                {products.map((p) => (
                  <td key={p.id}>
                    <strong>{money(Math.min(...p.variants.map((v) => v.priceMinor)))}</strong>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Independent store</th>
                {products.map((p) => (
                  <td key={p.id}>
                    <Link href={`/shop?vendor=${p.vendor.slug}`}>{p.vendor.storeName}</Link>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Verified reviews</th>
                {products.map((p) => (
                  <td key={p.id}>
                    {p.reviews.length
                      ? `${(p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length).toFixed(1)} / 5 · ${p.reviews.length} reviews`
                      : 'No reviews yet'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Available variants</th>
                {products.map((p) => (
                  <td key={p.id}>{p.variants.length}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Stock</th>
                {products.map((p) => (
                  <td key={p.id}>
                    {p.variants.some((v) => v.stockQty > v.reservedQty)
                      ? 'Available'
                      : 'Out of stock'}
                  </td>
                ))}
              </tr>
              {attrs.map((a) => (
                <tr key={a}>
                  <th scope="row">
                    {a} <small>(first variant)</small>
                  </th>
                  {products.map((p) => (
                    <td key={p.id}>{p.variants[0].attrs[a] || 'Not specified'}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Make it yours</th>
                {products.map((p) => {
                  const v = p.variants.find((v) => v.stockQty > v.reservedQty);
                  return (
                    <td key={p.id}>
                      <button className="button" disabled={!v} onClick={() => v && void add(v.id)}>
                        <ShoppingBag size={17} />
                        Add to bag
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
