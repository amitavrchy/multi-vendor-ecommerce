'use client';
import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useApi } from '@/lib/api';
import { ErrorBox, Loading, PageTitle } from '@/components/ui';
import { FollowButton } from '@/components/shopping-tools';
export default function Stores() {
  const { data, error, loading } = useApi<
    {
      id: string;
      slug: string;
      storeName: string;
      description: string;
      _count: { products: number };
    }[]
  >('/vendors');
  return (
    <div className="container page">
      <PageTitle
        eyebrow="GOOD PEOPLE, GREAT LITTLE STORES"
        title="Meet the independents."
        description="Real people with a passion for making your everyday a little better."
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        <div className="store-grid">
          {data?.map((v) => (
            <article className="store-card" key={v.id}>
              <span className="store-monogram">{v.storeName[0]}</span>
              <h2>
                <Link href={`/shop?vendor=${v.slug}`}>{v.storeName}</Link>
              </h2>
              <span className="verified">
                <ShieldCheck size={15} /> Verified independent store
              </span>
              <p>{v.description}</p>
              <Link href={`/shop?vendor=${v.slug}`} className="text-link">
                Explore {v._count.products} good finds <ArrowUpRight size={18} />
              </Link>
              <FollowButton vendorId={v.id} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
