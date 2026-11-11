import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { config } from './config';
import { Db } from './db';
@Injectable()
export class CacheService implements OnModuleDestroy {
  private redis?: Redis;
  private version = 0;
  private local = new Map<string, { value: unknown; expires: number }>();
  private buckets = new Map<string, { count: number; expires: number }>();
  constructor(private db: Db) {
    if (config.REDIS_URL) {
      this.redis = new Redis(config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => {});
      void this.redis.connect().catch(() => {});
    }
  }
  async remember<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    let version = String(this.version);
    try {
      if (this.redis?.status === 'ready')
        version = (await this.redis.get('bazaar:catalog-version')) || '0';
    } catch {}
    const tag = `bazaar:catalog:${version}:${key}`;
    try {
      if (this.redis?.status === 'ready') {
        const cached = await this.redis.get(tag);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    const cached = this.local.get(tag);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    const value = await load();
    this.local.set(tag, { value, expires: Date.now() + ttl * 1000 });
    if (this.local.size > 1000) this.local.clear();
    try {
      if (this.redis?.status === 'ready')
        await this.redis.set(tag, JSON.stringify(value), 'EX', ttl);
    } catch {}
    return value;
  }
  async purge() {
    if (!process.env.CDN_PURGE_URL) return;
    const r = await fetch(process.env.CDN_PURGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CDN_PURGE_TOKEN
          ? { Authorization: `Bearer ${process.env.CDN_PURGE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ tags: ['catalog'] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error('CDN tag purge failed');
  }
  async invalidate(purgeCdn = true) {
    this.version++;
    this.local.clear();
    try {
      if (this.redis?.status === 'ready') await this.redis.incr('bazaar:catalog-version');
    } catch {}
    if (purgeCdn && process.env.CDN_PURGE_URL) {
      try {
        await this.purge();
      } catch {
        await this.db.outboxEvent.create({
          data: { type: 'CACHE_INVALIDATION', payload: { tags: ['catalog'] } },
        });
      }
    }
  }
  async allow(key: string, limit: number, windowMs: number) {
    try {
      if (this.redis?.status === 'ready') {
        const count = (await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end;return n",
          1,
          `bazaar:rate:${key}`,
          windowMs,
        )) as number;
        return count <= limit;
      }
    } catch {}
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expires < now) {
      bucket = { count: 0, expires: now + windowMs };
      this.buckets.set(key, bucket);
    }
    if (this.buckets.size > 10000)
      for (const [k, b] of this.buckets) if (b.expires < now) this.buckets.delete(k);
    return ++bucket.count <= limit;
  }
  async onModuleDestroy() {
    this.redis?.disconnect();
  }
}
