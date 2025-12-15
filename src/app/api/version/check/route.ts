/* eslint-disable no-console */
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

import { CURRENT_VERSION } from '@/lib/version';

export const dynamic = 'force-dynamic';

/**
 * 版本检查 API
 * GET /api/version/check - 返回当前版本信息
 *
 * 注意: 实际的版本比较逻辑已移至客户端 (src/lib/version_check.ts)
 * 此 API 仅作为备用，提供服务端的版本信息
 */
export async function GET() {
  try {
    let timestamp = '';

    // 尝试从文件系统读取版本时间戳
    try {
      const filePath = path.join(process.cwd(), 'public', 'VERSION.txt');
      timestamp = (await fs.readFile(filePath, 'utf-8')).trim();
    } catch (e) {
      console.warn('无法读取 VERSION.txt:', e);
      // 使用硬编码的默认值
      timestamp = '20251212140536';
    }

    return NextResponse.json({
      success: true,
      version: CURRENT_VERSION,
      timestamp,
      displayVersion: `v${CURRENT_VERSION}`,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('版本检查 API 错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
