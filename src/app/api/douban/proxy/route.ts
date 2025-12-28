/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// API Keys
const API_KEY_A = '0ab215a8b1977939201640fa14c66bab'; // 用于详情、搜索
const API_KEY_B = '0df993c66c0c636e29ecbb5344252a4a'; // 用于评论、剧照

// 豆瓣 API 基础 URL
const DOUBAN_API_BASE = 'https://api.douban.com/v2';

/**
 * 根据请求路径选择合适的 API Key
 * - 详情 (subject) 和搜索使用 Key A
 * - 评论 (reviews, comments) 和剧照 (photos) 使用 Key B
 */
function selectApiKey(path: string): string {
  const lowerPath = path.toLowerCase();

  // 评论、剧照使用 Key B
  if (
    lowerPath.includes('/reviews') ||
    lowerPath.includes('/comments') ||
    lowerPath.includes('/photos')
  ) {
    return API_KEY_B;
  }

  // 其他（详情、搜索等）使用 Key A
  return API_KEY_A;
}

/**
 * GET /api/douban/proxy
 * 豆瓣 API 代理接口
 *
 * @param path - 目标路径，如 "movie/subject/12345"
 * @param type - 可选，用于强制指定 Key 类型 ("primary" | "secondary")
 *
 * 示例:
 * - /api/douban/proxy?path=movie/subject/12345
 * - /api/douban/proxy?path=movie/subject/12345/comments&count=10
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const forceKeyType = searchParams.get('type'); // "primary" | "secondary"

    // 验证必要参数
    if (!path) {
      return NextResponse.json(
        { error: '缺少必要参数: path', code: 400 },
        { status: 400 },
      );
    }

    // 选择 API Key
    let apiKey: string;
    if (forceKeyType === 'primary') {
      apiKey = API_KEY_A;
    } else if (forceKeyType === 'secondary') {
      apiKey = API_KEY_B;
    } else {
      apiKey = selectApiKey(path);
    }

    // 构建目标 URL
    // 移除 path 参数，保留其他查询参数
    const queryParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'path' && key !== 'type') {
        queryParams.append(key, value);
      }
    });

    // 添加 apikey
    queryParams.append('apikey', apiKey);

    const targetUrl = `${DOUBAN_API_BASE}/${path}?${queryParams.toString()}`;

    // 发起请求
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
      },
      // 设置超时
      signal: AbortSignal.timeout(10000),
    });

    // 检查响应状态
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

    // 解析并返回数据
    const data = await response.json();

    // 设置缓存头
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'CDN-Cache-Control': 'public, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('[Douban Proxy] Error:', error);

    // 处理超时错误
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
