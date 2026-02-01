/* eslint-disable no-console */
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';

export const runtime = 'nodejs';

// ============================================================================
// 弹弹play API 配置
// ============================================================================

const DANDANPLAY_API_BASE = 'https://api.dandanplay.net';

/**
 * 获取弹弹play API凭证
 * 优先从数据库配置读取，其次从环境变量读取
 */
async function getDandanplayCredentials(): Promise<{
  appId: string;
  appSecret: string;
}> {
  // 优先从数据库配置读取
  try {
    const config = await getConfig();
    const appId = config.SiteConfig?.DandanplayAppId || '';
    const appSecret = config.SiteConfig?.DandanplayAppSecret || '';

    if (appId && appSecret) {
      return { appId, appSecret };
    }
  } catch (e) {
    console.log('[danmu] Failed to get config, falling back to env:', e);
  }

  // 回退到环境变量
  return {
    appId: process.env.DANDANPLAY_APP_ID || '',
    appSecret: process.env.DANDANPLAY_APP_SECRET || '',
  };
}

// ============================================================================
// Types
// ============================================================================

interface DanmuItem {
  time: number;
  text: string;
  color?: string;
  mode?: 0 | 1 | 2;
}

interface DandanplaySearchResult {
  success?: boolean;
  errorCode?: number;
  errorMessage?: string;
  animes: Array<{
    animeId: number;
    animeTitle: string;
    type: string;
    episodes: Array<{
      episodeId: number;
      episodeTitle: string;
    }>;
  }>;
}

interface DandanplayCommentResult {
  count: number;
  comments: Array<{
    cid: number;
    p: string; // "时间,模式,颜色"
    m: string; // 弹幕内容
  }>;
}

// ============================================================================
// 弹弹play API 签名生成
// ============================================================================

/**
 * 生成弹弹play API签名
 * 算法: base64(sha256(AppId + Timestamp + Path + AppSecret))
 */
function generateDandanplaySignature(
  appId: string,
  appSecret: string,
  path: string,
  timestamp: number,
): string {
  const data = appId + timestamp + path + appSecret;
  const hash = createHash('sha256').update(data).digest('base64');
  return hash;
}

/**
 * 构建带签名的请求头
 */
function buildDandanplayHeaders(
  appId: string,
  appSecret: string,
  path: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'DecoTV/1.0',
  };

  // 如果配置了AppId和AppSecret，使用签名验证模式
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

// ============================================================================
// 弹幕解析与处理
// ============================================================================

/**
 * 解析弹弹play弹幕格式
 * p 格式: "时间,模式,颜色" 如 "12.345,1,16777215"
 * 模式: 1-普通滚动, 4-底部, 5-顶部
 */
function parseDandanComment(p: string, m: string): DanmuItem | null {
  try {
    const [timeStr, modeStr, colorStr] = p.split(',');
    const time = parseFloat(timeStr);
    const mode = parseInt(modeStr, 10);
    const colorNum = parseInt(colorStr, 10);

    if (isNaN(time) || time < 0) return null;

    // 转换颜色为十六进制
    const color = '#' + colorNum.toString(16).padStart(6, '0');

    // 转换模式: 弹弹play 1->滚动, 4->底部, 5->顶部
    // ArtPlayer: 0-滚动, 1-顶部, 2-底部
    let artMode: 0 | 1 | 2;
    switch (mode) {
      case 4:
        artMode = 2; // 底部
        break;
      case 5:
        artMode = 1; // 顶部
        break;
      default:
        artMode = 0; // 滚动
    }

    return {
      time,
      text: m,
      color,
      mode: artMode,
    };
  } catch {
    return null;
  }
}

/**
 * 弹幕去重
 */
function deduplicateDanmu(danmus: DanmuItem[]): DanmuItem[] {
  const seen = new Set<string>();
  return danmus.filter((d) => {
    // 使用时间+内容作为唯一标识（时间精确到0.1秒）
    const key = `${Math.round(d.time * 10)}_${d.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// 弹弹play API 调用
// ============================================================================

/**
 * 从弹弹play搜索动画
 */
async function searchDandanplayAnime(
  appId: string,
  appSecret: string,
  title: string,
): Promise<DandanplaySearchResult | null> {
  const path = '/api/v2/search/episodes';
  const url = `${DANDANPLAY_API_BASE}${path}?anime=${encodeURIComponent(title)}&episode=`;
  const headers = buildDandanplayHeaders(appId, appSecret, path);

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorHeader = response.headers.get('X-Error-Message');
      console.log(
        '[danmu] Dandanplay search failed:',
        response.status,
        errorHeader || '',
      );
      return null;
    }

    return response.json();
  } catch (err) {
    console.error('[danmu] Dandanplay search error:', err);
    return null;
  }
}

/**
 * 从弹弹play获取弹幕
 */
async function fetchDandanplayComments(
  appId: string,
  appSecret: string,
  episodeId: number,
): Promise<DandanplayCommentResult | null> {
  const path = `/api/v2/comment/${episodeId}`;
  const url = `${DANDANPLAY_API_BASE}${path}?withRelated=true&chConvert=1`;
  const headers = buildDandanplayHeaders(appId, appSecret, path);

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errorHeader = response.headers.get('X-Error-Message');
      console.log(
        '[danmu] Dandanplay comment fetch failed:',
        response.status,
        errorHeader || '',
      );
      return null;
    }

    return response.json();
  } catch (err) {
    console.error('[danmu] Dandanplay comment fetch error:', err);
    return null;
  }
}

/**
 * 从弹弹play获取弹幕（完整流程）
 */
async function fetchDandanplayDanmu(
  appId: string,
  appSecret: string,
  title: string,
  episode: number = 1,
): Promise<DanmuItem[]> {
  // 检查是否配置了API凭证
  if (!appId || !appSecret) {
    console.log('[danmu] Dandanplay API credentials not configured.');
    return [];
  }

  try {
    // 1. 搜索匹配的动画
    const searchData = await searchDandanplayAnime(appId, appSecret, title);

    if (!searchData || !searchData.animes || searchData.animes.length === 0) {
      console.log('[danmu] No anime found for:', title);
      return [];
    }

    // 找到最匹配的动画和集数
    let targetEpisodeId: number | null = null;

    for (const anime of searchData.animes) {
      // 优先找完全匹配的标题
      const titleMatch =
        anime.animeTitle.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(anime.animeTitle.toLowerCase());

      if (titleMatch && anime.episodes && anime.episodes.length >= episode) {
        targetEpisodeId = anime.episodes[episode - 1]?.episodeId;
        if (targetEpisodeId) break;
      }
    }

    // 如果没找到，使用第一个结果
    if (!targetEpisodeId && searchData.animes[0]?.episodes?.length >= episode) {
      targetEpisodeId = searchData.animes[0].episodes[episode - 1]?.episodeId;
    }

    if (!targetEpisodeId) {
      // 尝试取第一集
      targetEpisodeId = searchData.animes[0]?.episodes?.[0]?.episodeId;
    }

    if (!targetEpisodeId) {
      console.log('[danmu] No episode found for:', title, 'ep:', episode);
      return [];
    }

    console.log('[danmu] Found episodeId:', targetEpisodeId, 'for:', title);

    // 2. 获取弹幕
    const commentData = await fetchDandanplayComments(
      appId,
      appSecret,
      targetEpisodeId,
    );

    if (
      !commentData ||
      !commentData.comments ||
      commentData.comments.length === 0
    ) {
      console.log('[danmu] No comments found for episodeId:', targetEpisodeId);
      return [];
    }

    // 解析弹幕
    const danmus: DanmuItem[] = [];
    for (const comment of commentData.comments) {
      const parsed = parseDandanComment(comment.p, comment.m);
      if (parsed) {
        danmus.push(parsed);
      }
    }

    console.log(
      '[danmu] Fetched',
      danmus.length,
      'danmu from dandanplay for:',
      title,
    );
    return danmus;
  } catch (err) {
    console.error('[danmu] Dandanplay fetch error:', err);
    return [];
  }
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get('title');
  const episodeStr = searchParams.get('episode');
  const episode = episodeStr ? parseInt(episodeStr, 10) : 1;

  // 至少需要 title 才能搜索弹幕
  if (!title) {
    return NextResponse.json(
      { code: 400, message: '缺少必要参数: title', danmus: [], count: 0 },
      { status: 400 },
    );
  }

  // 获取API凭证（优先从数据库配置，其次从环境变量）
  const { appId, appSecret } = await getDandanplayCredentials();

  // 检查API凭证配置
  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        code: 503,
        message:
          '弹幕服务未配置。请在管理面板的站点设置中配置弹弹play AppId 和 AppSecret。',
        danmus: [],
        count: 0,
        hint: '请在管理面板 → 站点设置 → 弹弹play弹幕API配置中填入凭证',
      },
      { status: 503 },
    );
  }

  try {
    // 从弹弹play获取弹幕
    let allDanmus = await fetchDandanplayDanmu(
      appId,
      appSecret,
      title,
      episode,
    );

    // 去重
    allDanmus = deduplicateDanmu(allDanmus);

    // 按时间排序
    allDanmus.sort((a, b) => a.time - b.time);

    const cacheTime = await getCacheTime();

    return NextResponse.json(
      {
        code: 200,
        message: '获取成功',
        danmus: allDanmus,
        count: allDanmus.length,
        source: 'dandanplay',
      },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      },
    );
  } catch (err) {
    console.error('[danmu] API error:', err);
    return NextResponse.json(
      {
        code: 500,
        message: '获取弹幕失败',
        danmus: [],
        count: 0,
        error: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
