/* eslint-disable no-console */

'use client';

import {
  compareVersions,
  fetchPlainTextWithTimeout,
  VERSION_SOURCE_URLS,
} from '@/lib/version';

// 版本检查结果枚举
export enum UpdateStatus {
  HAS_UPDATE = 'has_update', // 有新版本
  NO_UPDATE = 'no_update', // 无新版本
  FETCH_FAILED = 'fetch_failed', // 获取失败
}

const VERSION_CHECK_ENDPOINT = '/api/version/check';

type VersionCheckPayload = {
  success?: boolean;
  hasUpdate?: boolean;
  checkFailed?: boolean;
  current?: {
    timestamp?: string;
  };
  remote?: {
    timestamp?: string;
  } | null;
};

/**
 * 客户端回退检查逻辑
 */
async function checkClientSideFallback(): Promise<{
  status: UpdateStatus;
  currentTimestamp?: string;
  remoteTimestamp?: string;
}> {
  try {
    // 1. 获取本地版本时间戳 (从 public/VERSION.txt)
    const localTimestamp = await fetchPlainTextWithTimeout('/VERSION.txt');
    if (!localTimestamp || !/^\d{14}$/.test(localTimestamp)) {
      throw new Error('无法获取本地版本时间戳');
    }

    // 2. 获取远程版本时间戳
    let remoteTimestamp: string | null = null;
    for (const url of VERSION_SOURCE_URLS) {
      remoteTimestamp = await fetchPlainTextWithTimeout(url);
      if (remoteTimestamp && /^\d{14}$/.test(remoteTimestamp)) {
        break;
      }
    }

    if (!remoteTimestamp) {
      throw new Error('无法获取远程版本时间戳');
    }

    // 3. 比较版本
    const comparison = compareVersions(localTimestamp, remoteTimestamp);
    // comparison < 0 意味着 local < remote，即有更新
    const hasUpdate = comparison < 0;

    return {
      status: hasUpdate ? UpdateStatus.HAS_UPDATE : UpdateStatus.NO_UPDATE,
      currentTimestamp: localTimestamp,
      remoteTimestamp: remoteTimestamp,
    };
  } catch (error) {
    console.warn('客户端回退检查失败:', error);
    return { status: UpdateStatus.FETCH_FAILED };
  }
}

/**
 * 检查是否有新版本可用
 */
export async function checkForUpdates(): Promise<{
  status: UpdateStatus;
  currentTimestamp?: string;
  remoteTimestamp?: string;
}> {
  try {
    const response = await fetch(VERSION_CHECK_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`请求版本信息失败: ${response.status}`);
    }

    const payload: VersionCheckPayload = await response.json();

    if (!payload?.success || !payload?.current?.timestamp) {
      throw new Error('版本检测响应无效');
    }

    if (payload.checkFailed) {
      // 如果服务端明确返回检查失败，尝试客户端回退
      console.warn('服务端检查失败，尝试客户端回退...');
      return await checkClientSideFallback();
    }

    return {
      status: payload.hasUpdate
        ? UpdateStatus.HAS_UPDATE
        : UpdateStatus.NO_UPDATE,
      currentTimestamp: payload.current.timestamp,
      remoteTimestamp: payload.remote?.timestamp,
    };
  } catch (error) {
    console.warn('API 版本检测失败，尝试客户端回退:', error);
    // API 调用失败（如 500, 502, 网络错误），尝试客户端回退
    return await checkClientSideFallback();
  }
}
