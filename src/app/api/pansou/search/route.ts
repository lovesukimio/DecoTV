import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { verifyApiAuth } from '@/lib/auth';
import { getPanSouCache, setPanSouCache } from '@/lib/pansou-cache';

export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

type SortMode = 'relevance' | 'newest' | 'oldest';
type FileTypeFilter =
  | 'all'
  | 'video'
  | 'subtitle'
  | 'document'
  | 'archive'
  | 'audio'
  | 'image'
  | 'other';
type TimeRangeFilter = 'all' | '24h' | '7d' | '30d' | '90d' | '1y';

interface PanSouMergedLink {
  url: string;
  password?: string;
  note?: string;
  datetime?: string;
  source?: string;
  images?: string[];
}

interface PanSouNormalizedItem {
  id: string;
  title: string;
  url: string;
  password: string;
  cloudType: string;
  source: string;
  datetime: string | null;
  fileType: FileTypeFilter;
  images: string[];
}

interface PanSouUpstreamData {
  merged_by_type?: Record<string, PanSouMergedLink[]>;
  total?: number;
}

interface PanSouUpstreamResponse {
  data?: PanSouUpstreamData;
  merged_by_type?: Record<string, PanSouMergedLink[]>;
  total?: number;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSortMode(raw: string | null): SortMode {
  if (raw === 'newest' || raw === 'oldest') return raw;
  return 'relevance';
}

function parseFileType(raw: string | null): FileTypeFilter {
  const accepted: FileTypeFilter[] = [
    'all',
    'video',
    'subtitle',
    'document',
    'archive',
    'audio',
    'image',
    'other',
  ];
  if (raw && accepted.includes(raw as FileTypeFilter)) {
    return raw as FileTypeFilter;
  }
  return 'all';
}

function parseTimeRange(raw: string | null): TimeRangeFilter {
  const accepted: TimeRangeFilter[] = ['all', '24h', '7d', '30d', '90d', '1y'];
  if (raw && accepted.includes(raw as TimeRangeFilter)) {
    return raw as TimeRangeFilter;
  }
  return 'all';
}

function detectFileType(input: string): FileTypeFilter {
  const text = input.toLowerCase();
  if (/\.(mp4|mkv|mov|avi|rmvb|ts|m4v|flv|wmv)(\b|$)/.test(text)) {
    return 'video';
  }
  if (/\.(srt|ass|ssa|vtt|sub)(\b|$)/.test(text)) {
    return 'subtitle';
  }
  if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|epub|mobi)(\b|$)/.test(text)) {
    return 'document';
  }
  if (/\.(zip|rar|7z|tar|gz|bz2|iso)(\b|$)/.test(text)) {
    return 'archive';
  }
  if (/\.(mp3|wav|flac|aac|m4a)(\b|$)/.test(text)) {
    return 'audio';
  }
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic)(\b|$)/.test(text)) {
    return 'image';
  }
  return 'other';
}

function parseDatetime(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;
  return timestamp;
}

function matchTimeRange(
  timestamp: number,
  timeRange: TimeRangeFilter,
): boolean {
  if (timeRange === 'all' || timestamp <= 0) return true;
  const now = Date.now();
  const elapsed = now - timestamp;

  const thresholdMap: Record<Exclude<TimeRangeFilter, 'all'>, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
  };

  return elapsed <= thresholdMap[timeRange];
}

function relevanceScore(item: PanSouNormalizedItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = item.title.toLowerCase();
  const url = item.url.toLowerCase();
  let score = 0;

  if (title === q) score += 120;
  if (title.includes(q)) score += 80;
  if (url.includes(q)) score += 20;
  if (item.source.toLowerCase().includes('plugin:')) score += 5;
  if (item.source.toLowerCase().includes('tg:')) score += 3;

  const timeScore = (() => {
    const timestamp = parseDatetime(item.datetime || undefined);
    if (!timestamp) return 0;
    const days = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    if (days <= 1) return 25;
    if (days <= 7) return 15;
    if (days <= 30) return 10;
    return 0;
  })();

  return score + timeScore;
}

function buildItemId(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export async function GET(request: NextRequest) {
  const authResult = verifyApiAuth(request);
  if (!authResult.isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const cloudTypes = parseListParam(
    request.nextUrl.searchParams.get('cloud_types'),
  );
  const sourceType =
    request.nextUrl.searchParams.get('source')?.trim() || 'all';
  const plugins = parseListParam(request.nextUrl.searchParams.get('plugins'));
  const sortMode = parseSortMode(request.nextUrl.searchParams.get('sort'));
  const fileTypeFilter = parseFileType(
    request.nextUrl.searchParams.get('file_type'),
  );
  const timeRangeFilter = parseTimeRange(
    request.nextUrl.searchParams.get('time_range'),
  );
  const limit = Math.min(
    Number.parseInt(request.nextUrl.searchParams.get('limit') || '120', 10) ||
      120,
    500,
  );
  const forceRefresh =
    request.nextUrl.searchParams.get('refresh') === '1' ||
    request.nextUrl.searchParams.get('refresh') === 'true';

  const cacheKey = [
    query.toLowerCase(),
    sourceType,
    cloudTypes.join(','),
    plugins.join(','),
    sortMode,
    fileTypeFilter,
    timeRangeFilter,
    limit,
  ].join('|');

  if (!forceRefresh) {
    const cached = await getPanSouCache<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...(cached.value as object),
        cache: `hit:${cached.layer}`,
      });
    }
  }

  const baseUrl = normalizeBaseUrl(
    process.env.PANSOU_API_BASE_URL ||
      process.env.NEXT_PUBLIC_PANSOU_API ||
      'http://127.0.0.1:8888',
  );
  const requestBody: Record<string, unknown> = {
    kw: query,
    res: 'merge',
    src: sourceType,
  };
  if (cloudTypes.length > 0) requestBody.cloud_types = cloudTypes;
  if (plugins.length > 0 && sourceType !== 'tg') requestBody.plugins = plugins;
  if (forceRefresh) requestBody.refresh = true;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (process.env.PANSOU_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.PANSOU_API_TOKEN}`;
  }

  let payload: PanSouUpstreamResponse | null = null;
  try {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'PanSou upstream error',
          status: response.status,
          details: errorText.slice(0, 300),
        },
        { status: 502 },
      );
    }
    payload = (await response.json()) as PanSouUpstreamResponse;
  } catch (error) {
    return NextResponse.json(
      {
        error: 'PanSou request failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  const data: PanSouUpstreamData = payload?.data || payload || {};
  const mergedByType = (data?.merged_by_type || {}) as Record<
    string,
    PanSouMergedLink[]
  >;

  const dedupMap = new Map<string, PanSouNormalizedItem>();
  Object.entries(mergedByType).forEach(([cloudType, links]) => {
    links.forEach((link) => {
      if (!link?.url) return;
      const title = (link.note || '').trim() || '未命名资源';
      const source = link.source || 'unknown';
      const datetime = link.datetime || null;
      const fileType = detectFileType(`${title} ${link.url}`);

      const id = buildItemId(`${cloudType}|${link.url}|${title}`);
      dedupMap.set(id, {
        id,
        title,
        url: link.url,
        password: link.password || '',
        cloudType,
        source,
        datetime,
        fileType,
        images: Array.isArray(link.images) ? link.images : [],
      });
    });
  });

  let items = Array.from(dedupMap.values());
  if (fileTypeFilter !== 'all') {
    items = items.filter((item) => item.fileType === fileTypeFilter);
  }
  items = items.filter((item) =>
    matchTimeRange(parseDatetime(item.datetime || undefined), timeRangeFilter),
  );

  if (sortMode === 'newest' || sortMode === 'oldest') {
    const factor = sortMode === 'newest' ? -1 : 1;
    items.sort((a, b) => {
      return (
        (parseDatetime(a.datetime || undefined) -
          parseDatetime(b.datetime || undefined)) *
        factor
      );
    });
  } else {
    items.sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
  }

  const limited = items.slice(0, limit);
  const cloudTypeStats = limited.reduce<Record<string, number>>((acc, item) => {
    acc[item.cloudType] = (acc[item.cloudType] || 0) + 1;
    return acc;
  }, {});

  const normalizedResponse = {
    cache: 'miss',
    query,
    total: items.length,
    count: limited.length,
    items: limited,
    filters: {
      cloud_types: cloudTypes,
      source: sourceType,
      plugins,
      sort: sortMode,
      file_type: fileTypeFilter,
      time_range: timeRangeFilter,
    },
    stats: {
      cloud_types: cloudTypeStats,
      upstream_total:
        typeof data?.total === 'number' ? data.total : dedupMap.size,
    },
    upstream: {
      base_url: baseUrl,
      request_body: safeJsonStringify(requestBody),
    },
    updated_at: new Date().toISOString(),
  };

  const ttlMs = Number.parseInt(
    process.env.PANSOU_CACHE_TTL_MS || '120000',
    10,
  );
  await setPanSouCache(
    cacheKey,
    normalizedResponse,
    Number.isFinite(ttlMs) ? ttlMs : 120000,
  );

  return NextResponse.json(normalizedResponse);
}
