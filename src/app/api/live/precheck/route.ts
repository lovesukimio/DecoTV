/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

type StreamType = 'm3u8' | 'mp4' | 'flv' | 'unknown';

function detectTypeFromContentType(contentType: string | null): StreamType {
  if (!contentType) return 'unknown';
  const lowerContentType = contentType.toLowerCase();

  if (
    lowerContentType.includes('application/vnd.apple.mpegurl') ||
    lowerContentType.includes('application/x-mpegurl') ||
    lowerContentType.includes('audio/mpegurl') ||
    lowerContentType.includes('mpegurl')
  ) {
    return 'm3u8';
  }

  if (lowerContentType.includes('video/mp4')) {
    return 'mp4';
  }

  if (
    lowerContentType.includes('video/x-flv') ||
    lowerContentType.includes('application/x-flv') ||
    lowerContentType.includes('flv')
  ) {
    return 'flv';
  }

  return 'unknown';
}

function detectTypeFromUrl(rawUrl: string): StreamType {
  const lowerUrl = rawUrl.toLowerCase();

  if (lowerUrl.includes('.m3u8')) return 'm3u8';
  if (lowerUrl.includes('.mp4')) return 'mp4';
  if (lowerUrl.includes('.flv')) return 'flv';

  return 'unknown';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('decotv-source');

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }
  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  try {
    const decodedUrl = decodeURIComponent(url);
    let detectedType = detectTypeFromUrl(decodedUrl);

    const response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      credentials: 'same-origin',
      headers: {
        'User-Agent': ua,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch', message: response.statusText },
        { status: 500 },
      );
    }

    const contentType = response.headers.get('Content-Type');
    const contentTypeType = detectTypeFromContentType(contentType);
    if (contentTypeType !== 'unknown') {
      detectedType = contentTypeType;
    } else {
      const redirectedType = detectTypeFromUrl(response.url);
      if (redirectedType !== 'unknown') {
        detectedType = redirectedType;
      }
    }

    if (response.body) {
      response.body.cancel();
    }

    return NextResponse.json(
      {
        success: true,
        type: detectedType === 'unknown' ? 'm3u8' : detectedType,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch', message: error },
      { status: 500 },
    );
  }
}
