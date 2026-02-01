/* eslint-disable no-console */
import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';

export const runtime = 'nodejs';

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
// Helpers
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

/**
 * 从弹弹play获取弹幕
 */
async function fetchDandanplayDanmu(
  title: string,
  episode: number = 1,
): Promise<DanmuItem[]> {
  try {
    // 1. 搜索匹配的动画
    const searchUrl = `https://api.dandanplay.net/api/v2/search/episodes?anime=${encodeURIComponent(title)}&episode=`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DecoTV/1.0',
      },
    });

    if (!searchResponse.ok) {
      console.log('[danmu] Dandanplay search failed:', searchResponse.status);
      return [];
    }

    const searchData: DandanplaySearchResult = await searchResponse.json();

    if (!searchData.animes || searchData.animes.length === 0) {
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

    // 2. 获取弹幕
    const commentUrl = `https://api.dandanplay.net/api/v2/comment/${targetEpisodeId}?withRelated=true&chConvert=1`;
    const commentResponse = await fetch(commentUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DecoTV/1.0',
      },
    });

    if (!commentResponse.ok) {
      console.log(
        '[danmu] Dandanplay comment fetch failed:',
        commentResponse.status,
      );
      return [];
    }

    const commentData: DandanplayCommentResult = await commentResponse.json();

    if (!commentData.comments || commentData.comments.length === 0) {
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

  const doubanId = searchParams.get('douban_id');
  const title = searchParams.get('title');
  const _year = searchParams.get('year'); // 预留供未来使用
  const episodeStr = searchParams.get('episode');
  const episode = episodeStr ? parseInt(episodeStr, 10) : 1;

  // 至少需要 title 才能搜索弹幕
  if (!title && !doubanId) {
    return NextResponse.json(
      { code: 400, message: '缺少必要参数: title 或 douban_id', danmus: [] },
      { status: 400 },
    );
  }

  try {
    const searchTitle = title || '';
    let allDanmus: DanmuItem[] = [];

    // 从弹弹play获取弹幕
    const dandanDanmus = await fetchDandanplayDanmu(searchTitle, episode);
    allDanmus = allDanmus.concat(dandanDanmus);

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
        error: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
