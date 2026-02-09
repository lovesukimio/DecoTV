/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyApiAuth } from '@/lib/auth';
import { getConfig, getLocalModeConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authResult = verifyApiAuth(request);

  try {
    const body = await request.json();

    // 本地模式（无数据库）：跳过认证
    if (authResult.isLocalMode) {
      const localConfig = getLocalModeConfig();
      localConfig.DanmuConfig = {
        enabled: body.enabled ?? false,
        serverUrl: body.serverUrl ?? '',
        token: body.token ?? '',
        platform: body.platform ?? '',
        sourceOrder: body.sourceOrder ?? '',
        mergeSourcePairs: body.mergeSourcePairs ?? '',
        bilibiliCookie: body.bilibiliCookie ?? '',
        convertTopBottomToScroll: body.convertTopBottomToScroll ?? false,
        convertColor: body.convertColor ?? 'default',
        danmuLimit: body.danmuLimit ?? 0,
        blockedWords: body.blockedWords ?? '',
        danmuOutputFormat: body.danmuOutputFormat ?? 'json',
        simplifiedTraditional: body.simplifiedTraditional ?? 'default',
      };
      return NextResponse.json({
        message: '弹幕配置更新成功（本地模式）',
        storageMode: 'local',
      });
    }

    // 认证失败
    if (!authResult.isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authResult.username;
    const adminConfig = await getConfig();

    // 权限校验
    if (username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username,
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    // 更新弹幕配置
    adminConfig.DanmuConfig = {
      enabled: body.enabled ?? false,
      serverUrl: body.serverUrl ?? '',
      token: body.token ?? '',
      platform: body.platform ?? '',
      sourceOrder: body.sourceOrder ?? '',
      mergeSourcePairs: body.mergeSourcePairs ?? '',
      bilibiliCookie: body.bilibiliCookie ?? '',
      convertTopBottomToScroll: body.convertTopBottomToScroll ?? false,
      convertColor: body.convertColor ?? 'default',
      danmuLimit: body.danmuLimit ?? 0,
      blockedWords: body.blockedWords ?? '',
      danmuOutputFormat: body.danmuOutputFormat ?? 'json',
      simplifiedTraditional: body.simplifiedTraditional ?? 'default',
    };

    await db.saveAdminConfig(adminConfig);

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('更新弹幕配置失败:', error);
    return NextResponse.json(
      { error: '更新弹幕配置失败', details: (error as Error).message },
      { status: 500 },
    );
  }
}
