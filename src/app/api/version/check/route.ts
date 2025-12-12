/* eslint-disable no-console */
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

import {
  checkForUpdates,
  CURRENT_VERSION,
  getCurrentVersionInfo,
  parseVersionTimestamp,
} from '@/lib/version';

export const dynamic = 'force-dynamic';

/**
 * 版本检查 API
 * GET /api/version/check - 检查当前版本状态和是否有更新
 */
export async function GET() {
  try {
    // 1. 尝试从文件系统读取本地版本信息 (更可靠)
    let currentVersion;
    try {
      const filePath = path.join(process.cwd(), 'public', 'VERSION.txt');
      const timestamp = (await fs.readFile(filePath, 'utf-8')).trim();
      const buildTime = parseVersionTimestamp(timestamp) || new Date();

      currentVersion = {
        version: CURRENT_VERSION,
        timestamp,
        buildTime,
        isLatest: true,
        updateAvailable: false,
        displayVersion: `v${CURRENT_VERSION}`,
      };
    } catch (e) {
      // 降级到默认方法
      console.warn(
        'Failed to read local VERSION.txt via fs, falling back to fetch:',
        e
      );
      currentVersion = await getCurrentVersionInfo();
    }

    const updateCheck = await checkForUpdates(currentVersion.timestamp);

    const response = {
      success: true,
      current: currentVersion,
      hasUpdate: updateCheck.hasUpdate,
      remote: updateCheck.remoteVersion,
      checkFailed: updateCheck.checkFailed,
      timestamp: Date.now(),
    };

    return NextResponse.json(response);
  } catch (error) {
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
