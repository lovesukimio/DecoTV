/* eslint-disable no-console */
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

const DANDANPLAY_API_BASE = 'https://api.dandanplay.net';

interface SearchEpisodeItem {
  episodeId: number;
  episodeTitle: string;
}

interface SearchAnimeItem {
  animeId: number;
  animeTitle: string;
  type: string;
  typeDescription?: string;
  imageUrl?: string;
  episodes: SearchEpisodeItem[];
}

function getDandanplayCredentials() {
  return {
    appId: process.env.DANDANPLAY_APP_ID || '',
    appSecret: process.env.DANDANPLAY_APP_SECRET || '',
  };
}

function generateDandanplaySignature(
  appId: string,
  appSecret: string,
  path: string,
  timestamp: number,
): string {
  const data = appId + timestamp + path + appSecret;
  return createHash('sha256').update(data).digest('base64');
}

function buildDandanplayHeaders(
  appId: string,
  appSecret: string,
  path: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'DecoTV/1.0',
  };

  if (appId && appSecret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateDandanplaySignature(
      appId,
      appSecret,
      path,
      timestamp,
    );
    headers['X-AppId'] = appId;
    headers['X-Timestamp'] = String(timestamp);
    headers['X-Signature'] = signature;
  }

  return headers;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeEpisodes(value: unknown): SearchEpisodeItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = readRecord(item);
      if (!row) return null;

      const episodeId = parsePositiveInt(row.episodeId);
      if (!episodeId) return null;

      return {
        episodeId,
        episodeTitle: readString(row.episodeTitle) || `episodeId:${episodeId}`,
      };
    })
    .filter((item): item is SearchEpisodeItem => item !== null);
}

function readImageUrl(row: Record<string, unknown>): string | undefined {
  return (
    readString(row.imageUrl) ||
    readString(row.animeImageUrl) ||
    readString(row.cover) ||
    readString(row.poster)
  );
}

function normalizeAnimes(value: unknown): SearchAnimeItem[] {
  if (!Array.isArray(value)) return [];
  const normalized: SearchAnimeItem[] = [];

  for (const item of value) {
    const row = readRecord(item);
    if (!row) continue;

    const animeId = parsePositiveInt(row.animeId);
    if (!animeId) continue;

    const episodes = normalizeEpisodes(row.episodes);
    if (episodes.length === 0) continue;

    const anime: SearchAnimeItem = {
      animeId,
      animeTitle: readString(row.animeTitle) || `animeId:${animeId}`,
      type: readString(row.type) || 'unknown',
      episodes,
    };

    const typeDescription = readString(row.typeDescription);
    if (typeDescription) {
      anime.typeDescription = typeDescription;
    }

    const imageUrl = readImageUrl(row);
    if (imageUrl) {
      anime.imageUrl = imageUrl;
    }

    normalized.push(anime);
  }

  return normalized;
}

async function searchFromDandanplay(keyword: string) {
  const { appId, appSecret } = getDandanplayCredentials();
  if (!appId || !appSecret) {
    return {
      ok: false,
      status: 503,
      message:
        '弹弹Play API 凭证未配置（缺少 DANDANPLAY_APP_ID / DANDANPLAY_APP_SECRET）',
      animes: [] as SearchAnimeItem[],
    };
  }

  const path = '/api/v2/search/episodes';
  const url = `${DANDANPLAY_API_BASE}${path}?anime=${encodeURIComponent(keyword)}&episode=`;
  const headers = buildDandanplayHeaders(appId, appSecret, path);

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        message: `弹弹Play 搜索失败: HTTP ${response.status}`,
        animes: [] as SearchAnimeItem[],
      };
    }

    const data = await response.json();
    if (data?.success === false) {
      return {
        ok: false,
        status: 502,
        message: `弹弹Play 搜索返回错误: ${data?.errorMessage || 'unknown'}`,
        animes: [] as SearchAnimeItem[],
      };
    }

    return {
      ok: true,
      status: 200,
      message: '获取成功',
      animes: normalizeAnimes(data?.animes),
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message: `弹弹Play 搜索异常: ${err instanceof Error ? err.message : String(err)}`,
      animes: [] as SearchAnimeItem[],
    };
  }
}

async function searchFromCustomServer(
  keyword: string,
  dc: NonNullable<Awaited<ReturnType<typeof getConfig>>['DanmuConfig']>,
) {
  const baseUrl = dc.serverUrl.replace(/\/+$/, '');
  const tokenSegment = dc.token ? `/${dc.token}` : '';
  const serverBase = `${baseUrl}${tokenSegment}`;

  try {
    const response = await fetch(
      `${serverBase}/api/v2/search/episodes?anime=${encodeURIComponent(keyword)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        message: `自定义弹幕搜索失败: HTTP ${response.status}`,
        animes: [] as SearchAnimeItem[],
      };
    }

    const data = await response.json();
    return {
      ok: true,
      status: 200,
      message: '获取成功',
      animes: normalizeAnimes(data?.animes),
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message: `自定义弹幕搜索异常: ${err instanceof Error ? err.message : String(err)}`,
      animes: [] as SearchAnimeItem[],
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get('keyword') || '').trim();

  if (!keyword) {
    return NextResponse.json(
      { code: 400, message: '缺少必要参数: keyword', animes: [] },
      { status: 400 },
    );
  }

  let danmuConfig: Awaited<ReturnType<typeof getConfig>>['DanmuConfig'] =
    undefined;
  try {
    const adminConfig = await getConfig();
    danmuConfig = adminConfig.DanmuConfig;
  } catch (err) {
    console.warn(
      '[danmu-search] Failed to read DanmuConfig, fallback to dandanplay:',
      err instanceof Error ? err.message : String(err),
    );
  }

  const customConfig =
    danmuConfig?.enabled === true && !!danmuConfig.serverUrl
      ? (danmuConfig as NonNullable<
          Awaited<ReturnType<typeof getConfig>>['DanmuConfig']
        >)
      : null;

  const searchResult = customConfig
    ? await searchFromCustomServer(keyword, customConfig)
    : await searchFromDandanplay(keyword);

  const source = customConfig ? 'custom-danmu-api' : 'dandanplay';

  if (!searchResult.ok) {
    return NextResponse.json(
      {
        code: searchResult.status,
        message: searchResult.message,
        source,
        keyword,
        animes: [],
      },
      { status: searchResult.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      code: 200,
      message: '获取成功',
      source,
      keyword,
      animes: searchResult.animes,
      count: searchResult.animes.length,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
