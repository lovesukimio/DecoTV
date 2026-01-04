/**
 * 缓存 API 端点
 *
 * 提供服务端缓存支持（可选）
 * - GET /api/cache?key=xxx - 获取缓存
 * - POST /api/cache - 设置缓存
 * - DELETE /api/cache?key=xxx - 删除缓存
 *
 * 生产环境建议：
 * - 使用 Redis (如 Upstash) 替代内存缓存
 * - 启用 UnifiedCache 的 enableAPI 选项
 *
 * 注意：当前实现使用内存缓存，服务器重启后数据丢失
 */

/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

// ============ 内存缓存存储 ============
// 生产环境应替换为 Redis

interface CacheEntry {
  data: unknown;
  expire: number; // 过期时间戳 (ms)
}

const memoryCache = new Map<string, CacheEntry>();

// ============ 定期清理过期缓存 ============

const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 分钟
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanupTimer() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    const entries = Array.from(memoryCache.entries());
    for (const [key, entry] of entries) {
      if (now >= entry.expire) {
        memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CacheAPI] 清理了 ${cleaned} 个过期项`);
    }
  }, CLEANUP_INTERVAL);
}

// ============ GET: 获取缓存 ============

export async function GET(req: NextRequest) {
  startCleanupTimer();

  const key = req.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json(
      { error: 'Missing required parameter: key' },
      { status: 400 },
    );
  }

  const entry = memoryCache.get(key);

  if (entry && Date.now() < entry.expire) {
    console.log(`[CacheAPI] GET 命中: ${key}`);
    return NextResponse.json({ data: entry.data });
  }

  // 缓存已过期或不存在
  if (entry) {
    memoryCache.delete(key);
    console.log(`[CacheAPI] GET 过期: ${key}`);
  }

  return NextResponse.json({ data: null });
}

// ============ POST: 设置缓存 ============

export async function POST(req: NextRequest) {
  startCleanupTimer();

  try {
    const body = await req.json();
    const { key, data, expireSeconds = 7200 } = body;

    if (!key) {
      return NextResponse.json(
        { error: 'Missing required field: key' },
        { status: 400 },
      );
    }

    if (data === undefined) {
      return NextResponse.json(
        { error: 'Missing required field: data' },
        { status: 400 },
      );
    }

    memoryCache.set(key, {
      data,
      expire: Date.now() + expireSeconds * 1000,
    });

    console.log(`[CacheAPI] POST 成功: ${key} (TTL: ${expireSeconds}s)`);

    return NextResponse.json({
      ok: true,
      key,
      expireSeconds,
    });
  } catch (error) {
    console.error('[CacheAPI] POST 错误:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
}

// ============ DELETE: 删除缓存 ============

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const prefix = req.nextUrl.searchParams.get('prefix');

  if (key) {
    // 删除单个缓存
    const existed = memoryCache.has(key);
    memoryCache.delete(key);
    console.log(`[CacheAPI] DELETE: ${key} (existed: ${existed})`);
    return NextResponse.json({ ok: true, deleted: key });
  }

  if (prefix) {
    // 按前缀批量删除
    let count = 0;
    const keys = Array.from(memoryCache.keys());
    for (const k of keys) {
      if (k.startsWith(prefix)) {
        memoryCache.delete(k);
        count++;
      }
    }
    console.log(`[CacheAPI] DELETE prefix: ${prefix} (count: ${count})`);
    return NextResponse.json({ ok: true, prefix, deleted: count });
  }

  return NextResponse.json(
    { error: 'Missing key or prefix parameter' },
    { status: 400 },
  );
}

// ============ OPTIONS: CORS 支持 ============

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
