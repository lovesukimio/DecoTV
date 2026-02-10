import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient, type RedisClientType } from 'redis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface RedisEnvelope<T> {
  value: T;
  expiresAt: number;
}

export type PanSouCacheLayer = 'memory' | 'redis';

export interface PanSouCacheHit<T> {
  value: T;
  layer: PanSouCacheLayer;
}

type RedisBackend =
  | {
      type: 'redis';
      client: RedisClientType;
    }
  | {
      type: 'upstash';
      client: UpstashRedis;
    };

const PAN_SOU_CACHE = new Map<string, CacheEntry<unknown>>();
const MIN_TTL_MS = 1000;
const DEFAULT_MAX_ENTRIES = 200;
const REDIS_ERROR_BACKOFF_MS = 30_000;
const REDIS_KEY_PREFIX = process.env.PANSOU_CACHE_PREFIX || 'decotv:pansou:';

const REDIS_CLIENT_SYMBOL = Symbol.for('decotv.pansou.redis.client');

let redisBackendPromise: Promise<RedisBackend | null> | null = null;
let redisDisabledUntil = 0;

function normalizeTtlMs(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) return 120_000;
  return Math.max(MIN_TTL_MS, Math.floor(ttlMs));
}

function getMaxEntries(): number {
  const parsed = Number.parseInt(
    process.env.PANSOU_CACHE_MAX_ENTRIES || '',
    10,
  );
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_ENTRIES;
}

function getRedisKey(key: string): string {
  return `${REDIS_KEY_PREFIX}${key}`;
}

function getFallbackTtlMs(): number {
  return normalizeTtlMs(
    Number.parseInt(process.env.PANSOU_CACHE_TTL_MS || '120000', 10),
  );
}

function cleanupMemoryCache(now: number): void {
  PAN_SOU_CACHE.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      PAN_SOU_CACHE.delete(key);
    }
  });
}

function getMemoryCache<T>(key: string): T | null {
  const now = Date.now();
  const entry = PAN_SOU_CACHE.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    PAN_SOU_CACHE.delete(key);
    return null;
  }

  // LRU: hit 后移动到末尾
  PAN_SOU_CACHE.delete(key);
  PAN_SOU_CACHE.set(key, entry);
  return entry.value as T;
}

function setMemoryCache<T>(key: string, value: T, ttlMs: number): void {
  const now = Date.now();
  cleanupMemoryCache(now);

  const maxEntries = getMaxEntries();
  if (PAN_SOU_CACHE.size >= maxEntries) {
    const oldestKey = PAN_SOU_CACHE.keys().next().value;
    if (oldestKey) PAN_SOU_CACHE.delete(oldestKey);
  }

  PAN_SOU_CACHE.set(key, {
    value,
    expiresAt: now + normalizeTtlMs(ttlMs),
  });
}

function markRedisUnavailable(error: unknown): void {
  redisDisabledUntil = Date.now() + REDIS_ERROR_BACKOFF_MS;
  redisBackendPromise = null;
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.warn(`[PanSouCache] Redis fallback to memory: ${message}`);
}

function getRedisClientFromGlobal(url: string): RedisClientType {
  const globalStore = globalThis as typeof globalThis & {
    [REDIS_CLIENT_SYMBOL]?: RedisClientType;
  };

  let client = globalStore[REDIS_CLIENT_SYMBOL];
  if (!client) {
    client = createClient({ url });
    client.on('error', (error) => {
      // eslint-disable-next-line no-console
      console.warn('[PanSouCache] Redis client error:', error);
    });
    globalStore[REDIS_CLIENT_SYMBOL] = client;
  }

  return client;
}

async function createRedisBackend(): Promise<RedisBackend | null> {
  const dedicatedRedisUrl = process.env.PANSOU_CACHE_REDIS_URL?.trim();
  const sharedRedisUrl = process.env.REDIS_URL?.trim();
  const dedicatedUpstashUrl = process.env.PANSOU_CACHE_UPSTASH_URL?.trim();
  const dedicatedUpstashToken = process.env.PANSOU_CACHE_UPSTASH_TOKEN?.trim();
  const sharedUpstashUrl =
    process.env.UPSTASH_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const sharedUpstashToken =
    process.env.UPSTASH_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();

  const redisUrl = dedicatedRedisUrl || sharedRedisUrl;
  const upstashUrl = dedicatedUpstashUrl || sharedUpstashUrl;
  const upstashToken = dedicatedUpstashToken || sharedUpstashToken;

  if (redisUrl) {
    const client = getRedisClientFromGlobal(redisUrl);
    if (!client.isOpen) {
      await client.connect();
    }
    return { type: 'redis', client };
  }

  if (upstashUrl && upstashToken) {
    return {
      type: 'upstash',
      client: new UpstashRedis({
        url: upstashUrl,
        token: upstashToken,
      }),
    };
  }

  return null;
}

async function getRedisBackend(): Promise<RedisBackend | null> {
  if (Date.now() < redisDisabledUntil) {
    return null;
  }

  if (!redisBackendPromise) {
    redisBackendPromise = createRedisBackend().catch((error) => {
      markRedisUnavailable(error);
      return null;
    });
  }

  return redisBackendPromise;
}

function parseRedisEnvelope<T>(raw: string): RedisEnvelope<T> | null {
  try {
    const parsed = JSON.parse(raw) as
      | RedisEnvelope<T>
      | T
      | Record<string, unknown>;

    if (
      parsed &&
      typeof parsed === 'object' &&
      'expiresAt' in parsed &&
      'value' in parsed &&
      typeof (parsed as RedisEnvelope<T>).expiresAt === 'number'
    ) {
      return parsed as RedisEnvelope<T>;
    }

    return {
      value: parsed as T,
      expiresAt: Date.now() + getFallbackTtlMs(),
    };
  } catch {
    return null;
  }
}

async function getRedisCache<T>(key: string): Promise<T | null> {
  const backend = await getRedisBackend();
  if (!backend) return null;

  const redisKey = getRedisKey(key);

  try {
    const rawValue =
      backend.type === 'redis'
        ? await backend.client.get(redisKey)
        : await backend.client.get<string>(redisKey);

    if (!rawValue || typeof rawValue !== 'string') {
      return null;
    }

    const envelope = parseRedisEnvelope<T>(rawValue);
    if (!envelope) return null;

    if (envelope.expiresAt <= Date.now()) {
      await deleteRedisCache(key);
      return null;
    }

    setMemoryCache(
      key,
      envelope.value,
      Math.max(MIN_TTL_MS, envelope.expiresAt - Date.now()),
    );

    return envelope.value;
  } catch (error) {
    markRedisUnavailable(error);
    return null;
  }
}

async function setRedisCache<T>(
  key: string,
  value: T,
  ttlMs: number,
): Promise<void> {
  const backend = await getRedisBackend();
  if (!backend) return;

  const redisKey = getRedisKey(key);
  const normalizedTtlMs = normalizeTtlMs(ttlMs);
  const payload: RedisEnvelope<T> = {
    value,
    expiresAt: Date.now() + normalizedTtlMs,
  };

  try {
    if (backend.type === 'redis') {
      await backend.client.set(redisKey, JSON.stringify(payload), {
        PX: normalizedTtlMs,
      });
      return;
    }

    await backend.client.set(redisKey, JSON.stringify(payload), {
      ex: Math.max(1, Math.ceil(normalizedTtlMs / 1000)),
    });
  } catch (error) {
    markRedisUnavailable(error);
  }
}

async function deleteRedisCache(key: string): Promise<void> {
  const backend = await getRedisBackend();
  if (!backend) return;

  try {
    const redisKey = getRedisKey(key);
    if (backend.type === 'redis') {
      await backend.client.del(redisKey);
      return;
    }

    await backend.client.del(redisKey);
  } catch (error) {
    markRedisUnavailable(error);
  }
}

export async function getPanSouCache<T>(
  key: string,
): Promise<PanSouCacheHit<T> | null> {
  const memoryHit = getMemoryCache<T>(key);
  if (memoryHit !== null) {
    return {
      value: memoryHit,
      layer: 'memory',
    };
  }

  const redisHit = await getRedisCache<T>(key);
  if (redisHit !== null) {
    return {
      value: redisHit,
      layer: 'redis',
    };
  }

  return null;
}

export async function setPanSouCache<T>(
  key: string,
  value: T,
  ttlMs: number,
): Promise<void> {
  const normalizedTtlMs = normalizeTtlMs(ttlMs);
  setMemoryCache(key, value, normalizedTtlMs);
  await setRedisCache(key, value, normalizedTtlMs);
}

export async function deletePanSouCache(key: string): Promise<void> {
  PAN_SOU_CACHE.delete(key);
  await deleteRedisCache(key);
}
