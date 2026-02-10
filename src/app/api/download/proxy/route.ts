import { NextRequest, NextResponse } from 'next/server';

import { verifyApiAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: '*/*',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function buildError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const authResult = verifyApiAuth(request);
  if (!authResult.isValid) {
    return buildError(401, 'Unauthorized');
  }

  const targetRaw = request.nextUrl.searchParams.get('url');
  if (!targetRaw) {
    return buildError(400, 'Missing url');
  }

  let targetUrl = '';
  try {
    targetUrl = decodeURIComponent(targetRaw);
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return buildError(400, 'Unsupported protocol');
    }
  } catch {
    return buildError(400, 'Invalid url');
  }

  const requestHeaders = new Headers(DEFAULT_HEADERS);
  const range = request.headers.get('range');
  if (range) {
    requestHeaders.set('Range', range);
  }

  try {
    const origin = new URL(targetUrl).origin;
    requestHeaders.set('Referer', `${origin}/`);
    requestHeaders.set('Origin', origin);
  } catch {
    // ignore invalid origin
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: requestHeaders,
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!response.ok) {
      return buildError(
        502,
        `Failed to fetch upstream resource (${response.status})`,
      );
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream',
    );
    headers.set('Cache-Control', 'no-store');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Range, Accept, Origin',
    );
    headers.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges',
    );

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      headers.set('Content-Range', contentRange);
    }

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) {
      headers.set('Accept-Ranges', acceptRanges);
    } else {
      headers.set('Accept-Ranges', 'bytes');
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return buildError(
      502,
      error instanceof Error ? error.message : 'Proxy request failed',
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Origin',
      'Access-Control-Max-Age': '86400',
    },
  });
}
