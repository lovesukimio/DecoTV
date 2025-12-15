/* eslint-disable no-console */

'use client';

/**
 * 版本检测模块 - 完全客户端实现
 * 通过直接比较本地和远程 VERSION.txt 时间戳来判断是否有更新
 * 时间戳格式: YYYYMMDDHHMMSS (14位数字)
 */

// 版本检查结果枚举
export enum UpdateStatus {
  CHECKING = 'checking', // 正在检测
  HAS_UPDATE = 'has_update', // 有新版本
  NO_UPDATE = 'no_update', // 已是最新版本
  FETCH_FAILED = 'fetch_failed', // 获取失败
}

// 远程版本源 - 按优先级排序
const UPDATE_REPO = process.env.NEXT_PUBLIC_UPDATE_REPO || 'Decohererk/DecoTV';
const UPDATE_REF = process.env.NEXT_PUBLIC_UPDATE_REF || 'main';

// 多个镜像源，确保至少一个能访问
const REMOTE_VERSION_URLS = [
  // GitHub Raw (国际)
  `https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_REF}/VERSION.txt`,
  // jsDelivr CDN (国际+国内加速)
  `https://cdn.jsdelivr.net/gh/${UPDATE_REPO}@${UPDATE_REF}/VERSION.txt`,
  // Fastly jsDelivr
  `https://fastly.jsdelivr.net/gh/${UPDATE_REPO}@${UPDATE_REF}/VERSION.txt`,
  // ghproxy 国内代理
  `https://ghproxy.net/https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_REF}/VERSION.txt`,
  // mirror.ghproxy
  `https://mirror.ghproxy.com/https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_REF}/VERSION.txt`,
];

const FETCH_TIMEOUT = 8000; // 8秒超时

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(
  url: string,
  timeout: number = FETCH_TIMEOUT
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // 添加缓存破坏参数
    const cacheBuster = `_t=${Date.now()}`;
    const urlWithCacheBuster = url.includes('?')
      ? `${url}&${cacheBuster}`
      : `${url}?${cacheBuster}`;

    const response = await fetch(urlWithCacheBuster, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'text/plain',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    return text.trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 验证时间戳格式是否正确 (14位数字)
 */
function isValidTimestamp(timestamp: string): boolean {
  return /^\d{14}$/.test(timestamp);
}

/**
 * 获取本地版本时间戳
 */
async function getLocalTimestamp(): Promise<string | null> {
  try {
    // 直接从 public/VERSION.txt 获取
    const timestamp = await fetchWithTimeout('/VERSION.txt', 3000);
    if (timestamp && isValidTimestamp(timestamp)) {
      return timestamp;
    }

    console.warn('本地 VERSION.txt 格式无效:', timestamp);
    return null;
  } catch (error) {
    console.warn('获取本地版本失败:', error);
    return null;
  }
}

/**
 * 获取远程版本时间戳 - 尝试多个镜像源
 */
async function getRemoteTimestamp(): Promise<string | null> {
  // 并行请求前 3 个源，哪个先返回有效结果就用哪个
  const firstBatch = REMOTE_VERSION_URLS.slice(0, 3);
  const results = await Promise.allSettled(
    firstBatch.map((url) => fetchWithTimeout(url, FETCH_TIMEOUT))
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const timestamp = result.value;
      if (isValidTimestamp(timestamp)) {
        return timestamp;
      }
    }
  }

  // 如果前3个都失败，依次尝试剩余的源
  for (let i = 3; i < REMOTE_VERSION_URLS.length; i++) {
    const timestamp = await fetchWithTimeout(REMOTE_VERSION_URLS[i]);
    if (timestamp && isValidTimestamp(timestamp)) {
      return timestamp;
    }
  }

  return null;
}

/**
 * 比较版本时间戳
 * @returns 正数: 本地更新, 0: 相同, 负数: 远程更新
 */
function compareTimestamps(local: string, remote: string): number {
  // 直接作为数字比较（14位数字可以安全地作为整数比较）
  const localNum = BigInt(local);
  const remoteNum = BigInt(remote);

  if (localNum > remoteNum) return 1;
  if (localNum < remoteNum) return -1;
  return 0;
}

/**
 * 格式化时间戳为可读日期
 */
export function formatTimestamp(timestamp: string): string {
  if (!isValidTimestamp(timestamp)) return timestamp;

  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(4, 6);
  const day = timestamp.slice(6, 8);
  const hour = timestamp.slice(8, 10);
  const minute = timestamp.slice(10, 12);
  const second = timestamp.slice(12, 14);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export interface VersionCheckResult {
  status: UpdateStatus;
  localTimestamp?: string;
  remoteTimestamp?: string;
  formattedLocalTime?: string;
  formattedRemoteTime?: string;
  error?: string;
}

/**
 * 检查版本更新 - 主入口函数
 * 完全在客户端执行，不依赖服务端 API
 */
export async function checkForUpdates(): Promise<VersionCheckResult> {
  try {
    // 并行获取本地和远程版本
    const [localTimestamp, remoteTimestamp] = await Promise.all([
      getLocalTimestamp(),
      getRemoteTimestamp(),
    ]);

    // 检查本地版本
    if (!localTimestamp) {
      console.error('无法获取本地版本时间戳');
      return {
        status: UpdateStatus.FETCH_FAILED,
        error: '无法读取本地版本信息',
      };
    }

    // 检查远程版本
    if (!remoteTimestamp) {
      console.error('无法获取远程版本时间戳');
      return {
        status: UpdateStatus.FETCH_FAILED,
        localTimestamp,
        formattedLocalTime: formatTimestamp(localTimestamp),
        error: '无法连接到更新服务器',
      };
    }

    // 比较版本
    const comparison = compareTimestamps(localTimestamp, remoteTimestamp);

    if (comparison < 0) {
      // 远程版本更新（远程时间戳更大 = 更新的版本）
      return {
        status: UpdateStatus.HAS_UPDATE,
        localTimestamp,
        remoteTimestamp,
        formattedLocalTime: formatTimestamp(localTimestamp),
        formattedRemoteTime: formatTimestamp(remoteTimestamp),
      };
    } else {
      // 本地版本相同或更新
      return {
        status: UpdateStatus.NO_UPDATE,
        localTimestamp,
        remoteTimestamp,
        formattedLocalTime: formatTimestamp(localTimestamp),
        formattedRemoteTime: formatTimestamp(remoteTimestamp),
      };
    }
  } catch (error) {
    console.error('版本检测发生错误:', error);
    return {
      status: UpdateStatus.FETCH_FAILED,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}
