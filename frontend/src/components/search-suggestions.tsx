'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useApi } from '@/lib/api';
export function SearchSuggestions({ query, close }: { query: string; close: () => void }) {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data } = useApi<{
    products: { id: string; slug: string; title: string; image: string }[];
    categories: { id: string; name: string }[];
  }>(debounced.length > 1 ? `/discovery/suggestions?q=${encodeURIComponent(debounced)}` : null);
  if (
    query.trim().length < 2 ||
    query.trim() !== debounced ||
    !data ||
    (!data.products.length && !data.categories.length)
  )
    return null;
  return (
    <div
      className="search-suggestions"
      aria-label="Search suggestions"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <span className="eyebrow">A FEW GOOD MATCHES</span>
      {data.products.map((p) => (
        <Link key={p.id} href={`/product/${p.slug}`} onClick={close}>
          <img src={p.image} alt="" />
          <span>{p.title}</span>
          <span aria-hidden="true">↗</span>
        </Link>
      ))}
      {data.categories.map((c) => (
        <Link key={c.id} href={`/shop?category=${c.id}`} onClick={close}>
          Explore {c.name} <span aria-hidden="true">→</span>
        </Link>
      ))}
      <Link href={`/shop?q=${encodeURIComponent(query)}`} onClick={close} className="all-results">
        See all results for “{query}” →
      </Link>
    </div>
  );
}
