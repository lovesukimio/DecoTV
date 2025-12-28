/* eslint-disable no-console */
import * as cheerio from 'cheerio';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// API Keys
const API_KEY_A = '0ab215a8b1977939201640fa14c66bab'; // 用于详情、搜索
const API_KEY_B = '0df993c66c0c636e29ecbb5344252a4a'; // 用于评论、剧照

// 豆瓣 API 基础 URL
const DOUBAN_API_BASE = 'https://api.douban.com/v2';
const DOUBAN_WEB_BASE = 'https://movie.douban.com';

// 通用请求头
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://movie.douban.com/',
  'Cache-Control': 'no-cache',
};

// ============================================================================
// 爬虫解析函数
// ============================================================================

/**
 * 从豆瓣网页提取短评
 */
async function scrapeComments(
  subjectId: string,
): Promise<{ comments: unknown[]; total: number }> {
  const url = `${DOUBAN_WEB_BASE}/subject/${subjectId}/comments?status=P&sort=new_score`;

  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`爬取短评失败: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const comments: unknown[] = [];

  // 解析评论列表
  $('.comment-item').each((_, element) => {
    const $item = $(element);

    // 提取用户信息
    const $avatar = $item.find('.avatar a img');
    const $userLink = $item.find('.comment-info a');
    const avatarUrl = $avatar.attr('src') || '';
    const userName = $userLink.text().trim();
    const userLink = $userLink.attr('href') || '';

    // 提取评分 (星级)
    const ratingClass = $item.find('.comment-info .rating').attr('class') || '';
    const ratingMatch = ratingClass.match(/allstar(\d+)/);
    const ratingValue = ratingMatch ? parseInt(ratingMatch[1]) / 10 : 0;

    // 提取评论内容和时间
    const content = $item.find('.short').text().trim();
    const time =
      $item.find('.comment-time').attr('title') ||
      $item.find('.comment-time').text().trim();

    // 提取点赞数
    const voteText = $item.find('.vote-count').text().trim();
    const usefulCount = parseInt(voteText) || 0;

    // 提取评论 ID
    const commentId =
      $item.attr('data-cid') || `scrape_${Date.now()}_${Math.random()}`;

    if (content) {
      comments.push({
        id: commentId,
        created_at: time,
        content,
        useful_count: usefulCount,
        rating: ratingValue > 0 ? { max: 5, value: ratingValue, min: 0 } : null,
        author: {
          id: userLink.split('/').filter(Boolean).pop() || '',
          uid: userName,
          name: userName,
          avatar: avatarUrl
            .replace('/u/pido/', '/u/')
            .replace('s_ratio', 'm_ratio'),
          alt: userLink,
        },
      });
    }
  });

  // 提取总评论数
  const totalText = $('.mod-hd h2 span').text();
  const totalMatch = totalText.match(/全部\s*(\d+)\s*条/);
  const total = totalMatch ? parseInt(totalMatch[1]) : comments.length;

  return { comments, total };
}

/**
 * 从豆瓣网页提取推荐影片
 */
async function scrapeRecommendations(
  subjectId: string,
): Promise<{ recommendations: unknown[] }> {
  const url = `${DOUBAN_WEB_BASE}/subject/${subjectId}/`;

  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`爬取推荐失败: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const recommendations: unknown[] = [];

  // 解析推荐区域
  $('#recommendations .recommendations-bd dl').each((_, element) => {
    const $item = $(element);
    const $link = $item.find('dd a');
    const $img = $item.find('dt img');

    const href = $link.attr('href') || '';
    const idMatch = href.match(/subject\/(\d+)/);
    const recId = idMatch ? idMatch[1] : '';

    const title = $link.text().trim();
    const poster = $img.attr('src') || '';

    if (recId && title) {
      recommendations.push({
        id: recId,
        title,
        images: {
          small: poster,
          medium: poster.replace('s_ratio', 'm_ratio'),
          large: poster.replace('s_ratio', 'l_ratio'),
        },
        alt: href,
      });
    }
  });

  return { recommendations };
}

/**
 * 从豆瓣网页提取演员信息 (高清头像)
 */
async function scrapeCelebrities(
  subjectId: string,
): Promise<{ celebrities: unknown[] }> {
  const url = `${DOUBAN_WEB_BASE}/subject/${subjectId}/celebrities`;

  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`爬取演员失败: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const celebrities: unknown[] = [];

  // 解析演员列表
  $('#celebrities .list-wrapper').each((_, wrapper) => {
    const $wrapper = $(wrapper);
    const category = $wrapper.find('h2').text().trim(); // 导演、演员等

    $wrapper.find('.celebrity').each((_, element) => {
      const $item = $(element);
      const $link = $item.find('a.name');
      const $avatar = $item.find('.avatar');

      const href = $link.attr('href') || '';
      const idMatch = href.match(/celebrity\/(\d+)/);
      const celId = idMatch ? idMatch[1] : '';

      const name = $link.text().trim();
      const role = $item.find('.role').text().trim();

      // 从 style 中提取背景图
      const avatarStyle = $avatar.attr('style') || '';
      const bgMatch = avatarStyle.match(/url\(([^)]+)\)/);
      let avatarUrl = bgMatch ? bgMatch[1].replace(/['"]/g, '') : '';

      // 转换为高清版本
      avatarUrl = avatarUrl
        .replace('/s_ratio/', '/m_ratio/')
        .replace('/small/', '/medium/');

      if (celId && name) {
        celebrities.push({
          id: celId,
          name,
          alt: href,
          category: category.replace(/\s+/g, ''),
          role,
          avatars: {
            small: avatarUrl.replace('/m_ratio/', '/s_ratio/'),
            medium: avatarUrl,
            large: avatarUrl.replace('/m_ratio/', '/l_ratio/'),
          },
        });
      }
    });
  });

  return { celebrities };
}

// ============================================================================
// 路由处理
// ============================================================================

/**
 * 检测是否需要使用爬虫模式
 */
function needsScraping(
  path: string,
): 'comments' | 'recommendations' | 'celebrities' | null {
  const lowerPath = path.toLowerCase();
  if (lowerPath.includes('/comments') || lowerPath.includes('/reviews')) {
    return 'comments';
  }
  if (lowerPath.includes('/recommendations')) {
    return 'recommendations';
  }
  if (lowerPath.includes('/celebrities')) {
    return 'celebrities';
  }
  return null;
}

/**
 * 从路径中提取 subject ID
 */
function extractSubjectId(path: string): string | null {
  const match = path.match(/subject\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * 根据请求路径选择合适的 API Key
 */
function selectApiKey(path: string): string {
  const lowerPath = path.toLowerCase();
  if (
    lowerPath.includes('/reviews') ||
    lowerPath.includes('/comments') ||
    lowerPath.includes('/photos')
  ) {
    return API_KEY_B;
  }
  return API_KEY_A;
}

/**
 * GET /api/douban/proxy
 * 豆瓣 API 代理接口 (支持自动降级爬虫)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const forceKeyType = searchParams.get('type');

    if (!path) {
      return NextResponse.json(
        { error: '缺少必要参数: path', code: 400 },
        { status: 400 },
      );
    }

    // 检查是否需要使用爬虫模式
    const scrapeType = needsScraping(path);
    const subjectId = extractSubjectId(path);

    if (scrapeType && subjectId) {
      console.log(
        `[Douban Proxy] 使用爬虫模式: ${scrapeType} for ${subjectId}`,
      );

      let data: unknown;

      switch (scrapeType) {
        case 'comments':
          data = await scrapeComments(subjectId);
          break;
        case 'recommendations':
          data = await scrapeRecommendations(subjectId);
          break;
        case 'celebrities':
          data = await scrapeCelebrities(subjectId);
          break;
      }

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'public, max-age=1800, s-maxage=1800',
          'X-Data-Source': 'scraper',
        },
      });
    }

    // ========================================================================
    // 标准 API 请求逻辑
    // ========================================================================

    let apiKey: string;
    if (forceKeyType === 'primary') {
      apiKey = API_KEY_A;
    } else if (forceKeyType === 'secondary') {
      apiKey = API_KEY_B;
    } else {
      apiKey = selectApiKey(path);
    }

    const queryParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'path' && key !== 'type') {
        queryParams.append(key, value);
      }
    });
    queryParams.append('apikey', apiKey);

    const targetUrl = `${DOUBAN_API_BASE}/${path}?${queryParams.toString()}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        Referer: BROWSER_HEADERS.Referer,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Douban Proxy] API Error:', response.status, errorText);

      return NextResponse.json(
        {
          error: '豆瓣 API 请求失败',
          status: response.status,
          details: errorText,
        },
        { status: response.status },
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'CDN-Cache-Control': 'public, s-maxage=3600',
        'X-Data-Source': 'api',
      },
    });
  } catch (error) {
    console.error('[Douban Proxy] Error:', error);

    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: '请求超时', code: 504 },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error: '代理请求失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 },
    );
  }
}
