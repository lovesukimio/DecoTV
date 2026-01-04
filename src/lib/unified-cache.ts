/**
 * 统一缓存管理系统 (Unified Cache System)
 *
 * 架构设计：
 * - 多层缓存：内存 (Memory) → localStorage → API (可选)
 * - 查询优先级：内存最快 (~0ms) → localStorage (~5ms) → API (~100-500ms)
 * - LRU 策略：内存缓存超过容量时，自动淘汰最久未使用的数据
 * - TTL 过期：所有缓存层都支持时间过期机制
 *
 * 使用场景：
 * - 导航切换（电影 ↔ 剧集）：从缓存瞬间读取，实现"0ms 瞬开"
 * - 豆瓣分类数据：缓存 2 小时，减少 API 请求
 * - 用户偏好设置：缓存持久化到 localStorage
 *
 * 参考：LunaTV "查询参数路由 + 混合缓存系统" 架构
 */

/* eslint-disable no-console */

// ============ 类型定义 ============

/**
 * 缓存条目结构
 */
interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;
  /** 写入时间戳 (ms) */
  timestamp: number;
  /** 过期时间 (秒) */
  ttl: number;
}

/**
 * 缓存配置选项
 */
interface CacheConfig {
  /** 是否启用内存缓存 (默认 true) */
  enableMemory?: boolean;
  /** 是否启用 localStorage 缓存 (默认 true) */
  enableLocalStorage?: boolean;
  /** 是否启用 API 缓存 (默认 false，需要后端支持) */
  enableAPI?: boolean;
  /** 默认 TTL (秒，默认 7200 = 2 小时) */
  defaultTTL?: number;
  /** 内存缓存最大条目数 (默认 100) */
  maxMemoryEntries?: number;
  /** localStorage 键前缀 (默认 'deco-cache:') */
  localStoragePrefix?: string;
}

// ============ 内存缓存实现 (LRU 策略) ============

/**
 * 内存缓存 - 最快的缓存层
 *
 * 特点：
 * - 同步读写，~0ms 延迟
 * - LRU (Least Recently Used) 淘汰策略
 * - 页面刷新后失效
 */
class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * 设置缓存
   * 如果超过容量，删除最旧的条目 (LRU)
   */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    // LRU 策略：超过最大容量时删除最旧的条目
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
        console.log(`[MemoryCache] LRU 淘汰: ${oldestKey}`);
      }
    }

    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds,
    });
  }

  /**
   * 获取缓存
   * 如果过期则删除并返回 null
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    // 检查是否过期
    const elapsed = (Date.now() - entry.timestamp) / 1000;
    if (elapsed > entry.ttl) {
      this.store.delete(key);
      console.log(`[MemoryCache] 已过期: ${key}`);
      return null;
    }

    // LRU 更新：删除后重新插入，移动到 Map 末尾
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.data as T;
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.store.clear();
    console.log('[MemoryCache] 已清空');
  }

  /**
   * 获取当前缓存数量
   */
  get size(): number {
    return this.store.size;
  }
}

// ============ localStorage 缓存实现 ============

/**
 * localStorage 缓存 - 持久化缓存层
 *
 * 特点：
 * - 数据持久化，页面刷新后仍然有效
 * - 需要 JSON 序列化/反序列化 (~5ms)
 * - 有容量限制 (~5MB)
 */
class LocalStorageCache {
  private prefix: string;

  constructor(prefix = 'deco-cache:') {
    this.prefix = prefix;
  }

  /**
   * 生成完整的存储键
   */
  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    if (typeof localStorage === 'undefined') return;

    const fullKey = this.getFullKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds,
    };

    try {
      localStorage.setItem(fullKey, JSON.stringify(entry));
    } catch (e) {
      // localStorage 可能已满
      console.warn('[LocalStorageCache] 存储失败，尝试清理过期数据...', e);
      this.cleanExpired();
      try {
        localStorage.setItem(fullKey, JSON.stringify(entry));
      } catch {
        console.error('[LocalStorageCache] 清理后仍无法存储');
      }
    }
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') return null;

    const fullKey = this.getFullKey(key);
    const stored = localStorage.getItem(fullKey);
    if (!stored) return null;

    try {
      const entry = JSON.parse(stored) as CacheEntry<T>;

      // 检查是否过期
      const elapsed = (Date.now() - entry.timestamp) / 1000;
      if (elapsed > entry.ttl) {
        localStorage.removeItem(fullKey);
        console.log(`[LocalStorageCache] 已过期: ${key}`);
        return null;
      }

      return entry.data;
    } catch {
      // JSON 解析失败，删除损坏的数据
      localStorage.removeItem(fullKey);
      return null;
    }
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.getFullKey(key));
  }

  /**
   * 清理所有过期的缓存条目
   */
  cleanExpired(): number {
    if (typeof localStorage === 'undefined') return 0;

    const keysToDelete: string[] = [];
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.prefix)) continue;

      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;

        const entry = JSON.parse(stored) as CacheEntry<unknown>;
        const elapsed = (now - entry.timestamp) / 1000;

        if (elapsed > entry.ttl) {
          keysToDelete.push(key);
        }
      } catch {
        // JSON 解析失败，也删除
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => localStorage.removeItem(key));
    console.log(`[LocalStorageCache] 清理了 ${keysToDelete.length} 个过期项`);
    return keysToDelete.length;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    if (typeof localStorage === 'undefined') return;

    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => localStorage.removeItem(key));
    console.log(`[LocalStorageCache] 已清空 ${keysToDelete.length} 个条目`);
  }
}

// ============ API 缓存实现 (可选) ============

/**
 * API 缓存 - 服务端辅助缓存层
 *
 * 特点：
 * - 需要后端 /api/cache 端点支持
 * - 可跨设备共享缓存 (如果使用 Redis)
 * - 延迟较高 (~100-500ms)
 */
class APICache {
  /**
   * 设置缓存
   */
  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data, expireSeconds: ttlSeconds }),
      });

      if (!response.ok) {
        throw new Error(`API 缓存保存失败: ${response.status}`);
      }
    } catch (e) {
      console.warn('[APICache] 保存失败:', e);
    }
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    if (typeof window === 'undefined') return null;

    try {
      const response = await fetch(
        `/api/cache?key=${encodeURIComponent(key)}`,
        { method: 'GET' },
      );

      if (!response.ok) return null;

      const result = await response.json();
      return result.data || null;
    } catch {
      return null;
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      await fetch(`/api/cache?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
    } catch {
      // 忽略错误
    }
  }
}

// ============ 统一缓存管理器 ============

/**
 * 统一缓存管理器 - 多层缓存的统一入口
 *
 * 查询优先级：Memory (0ms) → localStorage (5ms) → API (100-500ms)
 * 写入策略：同时写入所有启用的缓存层
 *
 * @example
 * ```typescript
 * const cache = new UnifiedCache({ defaultTTL: 7200 });
 *
 * // 写入缓存
 * await cache.set('douban-movie-热门', movieData);
 *
 * // 读取缓存（按优先级自动选择最快的层）
 * const data = await cache.get<MovieData>('douban-movie-热门');
 * ```
 */
export class UnifiedCache {
  private memoryCache: MemoryCache;
  private localStorageCache: LocalStorageCache;
  private apiCache: APICache;
  private config: Required<CacheConfig>;

  constructor(config: CacheConfig = {}) {
    this.config = {
      enableMemory: config.enableMemory ?? true,
      enableLocalStorage: config.enableLocalStorage ?? true,
      enableAPI: config.enableAPI ?? false,
      defaultTTL: config.defaultTTL ?? 7200, // 2 小时
      maxMemoryEntries: config.maxMemoryEntries ?? 100,
      localStoragePrefix: config.localStoragePrefix ?? 'deco-cache:',
    };

    this.memoryCache = new MemoryCache(this.config.maxMemoryEntries);
    this.localStorageCache = new LocalStorageCache(
      this.config.localStoragePrefix,
    );
    this.apiCache = new APICache();

    // 定期清理过期的 localStorage 缓存 (每 10 分钟)
    if (typeof window !== 'undefined') {
      setInterval(
        () => {
          this.localStorageCache.cleanExpired();
        },
        10 * 60 * 1000,
      );
    }
  }

  /**
   * 获取缓存数据
   *
   * 按优先级检查：Memory → localStorage → API
   * 如果在较慢层命中，会自动回填到较快层
   */
  async get<T>(key: string): Promise<T | null> {
    // 第一层：内存缓存（最快，~0ms）
    if (this.config.enableMemory) {
      const data = this.memoryCache.get<T>(key);
      if (data !== null) {
        console.log(`[UnifiedCache] 内存命中: ${key}`);
        return data;
      }
    }

    // 第二层：localStorage（中速，~5ms）
    if (this.config.enableLocalStorage) {
      const data = this.localStorageCache.get<T>(key);
      if (data !== null) {
        console.log(`[UnifiedCache] localStorage 命中: ${key}`);
        // 回填到内存缓存，加速下次访问
        if (this.config.enableMemory) {
          this.memoryCache.set(key, data, this.config.defaultTTL);
        }
        return data;
      }
    }

    // 第三层：API 缓存（最慢，~100-500ms）
    if (this.config.enableAPI) {
      try {
        const data = await this.apiCache.get<T>(key);
        if (data !== null) {
          console.log(`[UnifiedCache] API 命中: ${key}`);
          // 回填到内存和 localStorage
          if (this.config.enableMemory) {
            this.memoryCache.set(key, data, this.config.defaultTTL);
          }
          if (this.config.enableLocalStorage) {
            this.localStorageCache.set(key, data, this.config.defaultTTL);
          }
          return data;
        }
      } catch (e) {
        console.warn('[UnifiedCache] API 查询失败:', e);
      }
    }

    console.log(`[UnifiedCache] 全部未命中: ${key}`);
    return null;
  }

  /**
   * 设置缓存数据
   *
   * 同时写入所有启用的缓存层
   */
  async set<T>(
    key: string,
    data: T,
    ttlSeconds = this.config.defaultTTL,
  ): Promise<void> {
    // 写入内存
    if (this.config.enableMemory) {
      this.memoryCache.set(key, data, ttlSeconds);
    }

    // 写入 localStorage
    if (this.config.enableLocalStorage) {
      this.localStorageCache.set(key, data, ttlSeconds);
    }

    // 异步写入 API（不阻塞主流程）
    if (this.config.enableAPI) {
      this.apiCache.set(key, data, ttlSeconds).catch((e) => {
        console.warn('[UnifiedCache] API 写入失败:', e);
      });
    }

    console.log(`[UnifiedCache] 数据已保存: ${key}`);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.localStorageCache.delete(key);
    await this.apiCache.delete(key);
    console.log(`[UnifiedCache] 数据已删除: ${key}`);
  }

  /**
   * 清理所有过期缓存
   */
  cleanExpired(): void {
    this.localStorageCache.cleanExpired();
    console.log('[UnifiedCache] 过期数据已清理');
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.memoryCache.clear();
    this.localStorageCache.clear();
    console.log('[UnifiedCache] 所有缓存已清空');
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { memorySize: number } {
    return {
      memorySize: this.memoryCache.size,
    };
  }
}

// ============ 全局缓存实例 ============

/**
 * 全局缓存实例
 *
 * 配置：
 * - 内存缓存：启用，最多 100 条
 * - localStorage：启用，前缀 'deco-cache:'
 * - API 缓存：禁用（需要后端支持时启用）
 * - 默认 TTL：7200 秒 (2 小时)
 */
export const globalCache = new UnifiedCache({
  enableMemory: true,
  enableLocalStorage: true,
  enableAPI: false, // 暂时禁用，需要后端 /api/cache 支持
  defaultTTL: 7200,
  maxMemoryEntries: 100,
  localStoragePrefix: 'deco-cache:',
});

// ============ 辅助函数 ============

/**
 * 生成缓存键
 *
 * @example
 * ```typescript
 * const key = generateCacheKey('douban', { kind: 'movie', category: '热门' });
 * // => 'douban-kind=movie&category=热门'
 * ```
 */
export function generateCacheKey(
  prefix: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const filteredParams = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return `${prefix}-${filteredParams}`;
}

/**
 * 带缓存的数据获取函数
 *
 * @example
 * ```typescript
 * const data = await fetchWithCache(
 *   'douban-movie-热门',
 *   async () => {
 *     const res = await fetch('/api/douban?type=movie');
 *     return res.json();
 *   },
 *   3600 // 1 小时
 * );
 * ```
 */
export async function fetchWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  // 先检查缓存
  const cached = await globalCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 缓存未命中，发起请求
  const data = await fetchFn();

  // 保存到缓存
  await globalCache.set(key, data, ttlSeconds);

  return data;
}
