/* eslint-disable no-console */
/**
 * CMS 代理接口
 *
 * 用途：解决 Mixed Content Blocking 问题
 * - HTTPS 页面无法直接请求 HTTP 的第三方采集源 API
 * - 通过服务端代理转发请求，绕过浏览器限制
 *
 * 使用方式：
 * GET /api/proxy/cms?url=<encodeURIComponent(targetUrl)>
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // 使用 Edge Runtime 提高性能

// 允许的 API 路径模式（安全白名单）
const ALLOWED_PATTERNS = [
  /\?ac=class/, // 获取分类
  /\?ac=list/, // 获取列表
  /\?ac=videolist/, // 获取视频列表
  /\?ac=detail/, // 获取详情
  /\/api\.php/, // 常见 CMS API 路径
  /\/provide\/vod/, // 苹果 CMS 路径
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  // 参数验证
  if (!targetUrl) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  // 解码 URL
  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(targetUrl);
  } catch {
    return NextResponse.json({ error: 'URL 解码失败' }, { status: 400 });
  }

  // 安全检查：验证是否为合法的 CMS API 请求
  const isAllowed = ALLOWED_PATTERNS.some((pattern) =>
    pattern.test(decodedUrl),
  );
  if (!isAllowed) {
    console.warn('[CMS Proxy] Blocked request to:', decodedUrl);
    return NextResponse.json({ error: '不允许代理此 URL' }, { status: 403 });
  }

  console.log('[CMS Proxy] Fetching:', decodedUrl);

  try {
    // 发起服务端请求（不受 Mixed Content 限制）
    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: new URL(decodedUrl).origin + '/',
      },
      // 设置超时
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(
        '[CMS Proxy] Upstream error:',
        response.status,
        response.statusText,
      );
      return NextResponse.json(
        { error: `上游服务器返回 ${response.status}` },
        { status: response.status },
      );
    }

    // 获取响应内容
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // 尝试解析为 JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // 如果不是 JSON，可能是 XML，返回原始文本
      console.log('[CMS Proxy] Response is not JSON, returning raw text');
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': contentType || 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=300', // 缓存 5 分钟
        },
      });
    }

    console.log('[CMS Proxy] Success, data keys:', Object.keys(data));

    // 返回 JSON 响应
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=300', // 缓存 5 分钟
      },
    });
  } catch (error) {
    console.error('[CMS Proxy] Fetch error:', error);

    // 区分超时和其他错误
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return NextResponse.json(
          { error: '请求超时（15秒）' },
          { status: 504 },
        );
      }
    }

    return NextResponse.json(
      { error: '代理请求失败', details: String(error) },
      { status: 500 },
    );
  }
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
