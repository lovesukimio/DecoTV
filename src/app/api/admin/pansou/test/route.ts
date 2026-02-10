/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyApiAuth } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import {
  getDefaultPanSouConfig,
  normalizePanSouServerUrl,
  normalizePanSouToken,
  resolvePanSouHealthUrl,
  resolvePanSouSearchUrl,
} from '@/lib/pansou';

export const runtime = 'nodejs';

interface PanSouTestPayload {
  serverUrl?: string;
  token?: string;
  keyword?: string;
}

function buildAuthHeader(
  token: string,
  fallbackAuthorization: string | null,
): string {
  if (token) {
    return `Bearer ${token}`;
  }
  return fallbackAuthorization || '';
}

function estimateSearchCount(data: unknown): number {
  if (!data || typeof data !== 'object') {
    return 0;
  }

  const payload = data as {
    total?: number;
    data?: {
      total?: number;
      merged_by_type?: Record<string, Array<unknown>>;
    };
    merged_by_type?: Record<string, Array<unknown>>;
  };

  if (typeof payload.data?.total === 'number') {
    return payload.data.total;
  }
  if (typeof payload.total === 'number') {
    return payload.total;
  }

  const merged = payload.data?.merged_by_type || payload.merged_by_type;
  if (!merged || typeof merged !== 'object') {
    return 0;
  }

  return Object.values(merged).reduce((sum, list) => {
    return sum + (Array.isArray(list) ? list.length : 0);
  }, 0);
}

export async function POST(request: NextRequest) {
  const authResult = verifyApiAuth(request);

  if (!authResult.isLocalMode && !authResult.isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as PanSouTestPayload;
    const config = await getConfig();
    const defaults = getDefaultPanSouConfig();

    const serverUrl =
      normalizePanSouServerUrl(body.serverUrl) ||
      normalizePanSouServerUrl(config.PanSouConfig?.serverUrl) ||
      defaults.serverUrl;
    const token =
      normalizePanSouToken(body.token) ||
      normalizePanSouToken(config.PanSouConfig?.token);
    const keyword =
      typeof body.keyword === 'string' && body.keyword.trim()
        ? body.keyword.trim()
        : '测试';

    if (!serverUrl) {
      return NextResponse.json(
        { success: false, error: '请先填写 PanSou 服务地址' },
        { status: 400 },
      );
    }

    const healthUrl = resolvePanSouHealthUrl(serverUrl);
    const searchUrl = new URL(resolvePanSouSearchUrl(serverUrl));
    searchUrl.searchParams.set('kw', keyword);
    searchUrl.searchParams.set('res', 'merge');

    const authorization = buildAuthHeader(
      token,
      request.headers.get('authorization'),
    );
    const headers = new Headers({
      Accept: 'application/json',
    });
    if (authorization) {
      headers.set('Authorization', authorization);
    }

    const startedAt = Date.now();
    const healthResponse = await fetch(healthUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const healthRaw = await healthResponse.text();
    const healthJson = JSON.parse(healthRaw || '{}') as Record<string, unknown>;

    if (!healthResponse.ok) {
      return NextResponse.json({
        success: false,
        latency: Date.now() - startedAt,
        healthStatus: healthResponse.status,
        error:
          (healthJson.error as string) ||
          `健康检查失败 (${healthResponse.status})`,
      });
    }

    const searchResponse = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const searchRaw = await searchResponse.text();
    const searchJson = JSON.parse(searchRaw || '{}') as Record<string, unknown>;

    if (!searchResponse.ok) {
      return NextResponse.json({
        success: false,
        latency: Date.now() - startedAt,
        healthStatus: healthResponse.status,
        searchStatus: searchResponse.status,
        error:
          (searchJson.error as string) ||
          `搜索接口异常 (${searchResponse.status})`,
      });
    }

    return NextResponse.json({
      success: true,
      latency: Date.now() - startedAt,
      healthStatus: healthResponse.status,
      searchStatus: searchResponse.status,
      searchResultCount: estimateSearchCount(searchJson),
      health: healthJson,
    });
  } catch (error) {
    console.error('PanSou 连通性测试失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败',
    });
  }
}
