/* eslint-disable no-console */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

/** 弹幕数据项 */
export interface DanmuItem {
  /** 弹幕出现时间（秒） */
  time: number;
  /** 弹幕文本内容 */
  text: string;
  /** 弹幕颜色（十六进制） */
  color?: string;
  /** 弹幕模式：0-滚动，1-顶部，2-底部 */
  mode?: 0 | 1 | 2;
  /** 边框颜色 */
  border?: boolean;
}

/** 弹幕设置配置 */
export interface DanmuSettings {
  /** 是否启用外部弹幕 */
  enabled: boolean;
  /** 字体大小 (12-48) */
  fontSize: number;
  /** 滚动速度 (1-10) */
  speed: number;
  /** 透明度 (0-1) */
  opacity: number;
  /** 弹幕区域占比 (0-1) */
  margin: [number, number]; // [top, bottom]
  /** 启用的弹幕模式 */
  modes: number[]; // [0, 1, 2] 对应 滚动/顶部/底部
  /** 防重叠 */
  antiOverlap: boolean;
  /** 是否显示弹幕 */
  visible: boolean;
}

/** 弹幕匹配信息（由服务端返回） */
export interface DanmuMatchInfo {
  /** 匹配到的番剧标题 */
  animeTitle: string;
  /** 匹配到的剧集标题 */
  episodeTitle: string;
  /** 弹弹play episodeId */
  episodeId: number;
  /** 匹配方式描述 */
  matchLevel: string;
}

/** useDanmu Hook 返回类型 */
export interface UseDanmuResult {
  /** 弹幕数据 */
  danmuList: DanmuItem[];
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 弹幕设置 */
  settings: DanmuSettings;
  /** 匹配信息（命中了哪个番剧的哪一集） */
  matchInfo: DanmuMatchInfo | null;
  /** 更新设置 */
  updateSettings: (newSettings: Partial<DanmuSettings>) => void;
  /** 重新加载弹幕 */
  reload: () => Promise<void>;
  /** 清空弹幕 */
  clear: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEYS = {
  enabled: 'enable_external_danmu',
  fontSize: 'danmaku_fontSize',
  speed: 'danmaku_speed',
  opacity: 'danmaku_opacity',
  margin: 'danmaku_margin',
  modes: 'danmaku_modes',
  antiOverlap: 'danmaku_antiOverlap',
  visible: 'danmaku_visible',
} as const;

const DEFAULT_SETTINGS: DanmuSettings = {
  enabled: false,
  fontSize: 25,
  speed: 5,
  opacity: 1,
  margin: [0, 0],
  modes: [0, 1, 2],
  antiOverlap: true,
  visible: true,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * 从 localStorage 读取设置
 */
function loadSettingsFromStorage(): DanmuSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    return {
      enabled: localStorage.getItem(STORAGE_KEYS.enabled) === 'true',
      fontSize: parseInt(
        localStorage.getItem(STORAGE_KEYS.fontSize) || '25',
        10,
      ),
      speed: parseInt(localStorage.getItem(STORAGE_KEYS.speed) || '5', 10),
      opacity: parseFloat(localStorage.getItem(STORAGE_KEYS.opacity) || '1'),
      margin: JSON.parse(localStorage.getItem(STORAGE_KEYS.margin) || '[0, 0]'),
      modes: JSON.parse(
        localStorage.getItem(STORAGE_KEYS.modes) || '[0, 1, 2]',
      ),
      antiOverlap: localStorage.getItem(STORAGE_KEYS.antiOverlap) !== 'false',
      visible: localStorage.getItem(STORAGE_KEYS.visible) !== 'false',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * 保存设置到 localStorage
 */
function saveSettingsToStorage(settings: DanmuSettings): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEYS.enabled, String(settings.enabled));
    localStorage.setItem(STORAGE_KEYS.fontSize, String(settings.fontSize));
    localStorage.setItem(STORAGE_KEYS.speed, String(settings.speed));
    localStorage.setItem(STORAGE_KEYS.opacity, String(settings.opacity));
    localStorage.setItem(STORAGE_KEYS.margin, JSON.stringify(settings.margin));
    localStorage.setItem(STORAGE_KEYS.modes, JSON.stringify(settings.modes));
    localStorage.setItem(
      STORAGE_KEYS.antiOverlap,
      String(settings.antiOverlap),
    );
    localStorage.setItem(STORAGE_KEYS.visible, String(settings.visible));
  } catch (err) {
    console.error('[useDanmu] Failed to save settings:', err);
  }
}

// ============================================================================
// Hook
// ============================================================================

interface UseDanmuParams {
  /** 豆瓣 ID */
  doubanId?: number | string | null;
  /** 影片标题 */
  title?: string;
  /** 年份 */
  year?: string;
  /** 集数（从 1 开始） */
  episode?: number;
}

/**
 * 弹幕 Hook
 * 负责外部弹幕的加载、缓存、设置管理
 */
export function useDanmu(params: UseDanmuParams): UseDanmuResult {
  const { doubanId, title, year, episode } = params;

  // 状态
  const [danmuList, setDanmuList] = useState<DanmuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [settings, setSettings] = useState<DanmuSettings>(DEFAULT_SETTINGS);
  const [matchInfo, setMatchInfo] = useState<DanmuMatchInfo | null>(null);

  // 防抖 ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchKeyRef = useRef<string>('');

  // 初始化设置
  useEffect(() => {
    setSettings(loadSettingsFromStorage());
  }, []);

  // 生成缓存 key
  const getCacheKey = useCallback(() => {
    if (doubanId) {
      return `danmu_${doubanId}_${episode || 1}`;
    }
    if (title) {
      return `danmu_${title}_${year || ''}_${episode || 1}`;
    }
    return '';
  }, [doubanId, title, year, episode]);

  // 加载弹幕
  const fetchDanmu = useCallback(async () => {
    if (!settings.enabled) {
      setDanmuList([]);
      return;
    }

    const cacheKey = getCacheKey();
    if (!cacheKey) {
      setDanmuList([]);
      return;
    }

    // 防止重复请求同一资源
    if (cacheKey === lastFetchKeyRef.current && danmuList.length > 0) {
      return;
    }

    // 尝试从缓存读取
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        if (
          parsedCache.timestamp &&
          Date.now() - parsedCache.timestamp < 2 * 3600 * 1000
        ) {
          setDanmuList(parsedCache.data);
          if (parsedCache.match) {
            setMatchInfo(parsedCache.match as DanmuMatchInfo);
          }
          lastFetchKeyRef.current = cacheKey;
          console.log(
            '[useDanmu] Cache hit:',
            parsedCache.data.length,
            'danmu',
          );
          return;
        }
      }
    } catch {
      // 缓存读取失败，继续请求
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (doubanId) {
        queryParams.set('douban_id', String(doubanId));
      }
      if (title) {
        queryParams.set('title', title);
      }
      if (year) {
        queryParams.set('year', year);
      }
      if (episode) {
        queryParams.set('episode', String(episode));
      }

      const response = await fetch(
        `/api/danmu-external?${queryParams.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`获取弹幕失败: ${response.status}`);
      }

      const data = await response.json();

      if (data.code === 200 && Array.isArray(data.danmus)) {
        const danmus: DanmuItem[] = data.danmus;
        setDanmuList(danmus);
        lastFetchKeyRef.current = cacheKey;

        // 保存匹配信息
        if (data.match) {
          setMatchInfo(data.match as DanmuMatchInfo);
        } else {
          setMatchInfo(null);
        }

        // 缓存到 sessionStorage（含匹配信息）
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              data: danmus,
              match: data.match || null,
              timestamp: Date.now(),
            }),
          );
        } catch {
          // 缓存失败，忽略
        }

        console.log(
          '[useDanmu] Fetched:',
          danmus.length,
          'danmu',
          data.match
            ? `→ ${data.match.animeTitle} [${data.match.episodeTitle}]`
            : '',
        );
      } else {
        setDanmuList([]);
        setMatchInfo(null);
      }
    } catch (err) {
      console.error('[useDanmu] Fetch error:', err);
      setError(err instanceof Error ? err : new Error('加载弹幕失败'));
      setDanmuList([]);
      setMatchInfo(null);
    } finally {
      setLoading(false);
    }
  }, [
    settings.enabled,
    doubanId,
    title,
    year,
    episode,
    getCacheKey,
    danmuList.length,
  ]);

  // 监听参数变化，带防抖加载弹幕
  useEffect(() => {
    if (!settings.enabled) {
      setDanmuList([]);
      return;
    }

    // 清除之前的防抖
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // 300ms 防抖
    debounceRef.current = setTimeout(() => {
      fetchDanmu();
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, doubanId, title, year, episode]);

  // 更新设置
  const updateSettings = useCallback((newSettings: Partial<DanmuSettings>) => {
    setSettings((prev) => {
      const hasChanges = Object.entries(newSettings).some(([key, value]) => {
        const settingKey = key as keyof DanmuSettings;
        return !Object.is(prev[settingKey], value);
      });

      if (!hasChanges) {
        return prev;
      }

      const updated = { ...prev, ...newSettings };
      saveSettingsToStorage(updated);
      return updated;
    });
  }, []);

  // 重新加载
  const reload = useCallback(async () => {
    lastFetchKeyRef.current = ''; // 清除缓存 key，强制重新请求
    const cacheKey = getCacheKey();
    if (cacheKey) {
      try {
        sessionStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
    }
    await fetchDanmu();
  }, [fetchDanmu, getCacheKey]);

  // 清空弹幕
  const clear = useCallback(() => {
    setDanmuList([]);
    setMatchInfo(null);
    lastFetchKeyRef.current = '';
  }, []);

  return {
    danmuList,
    loading,
    error,
    settings,
    matchInfo,
    updateSettings,
    reload,
    clear,
  };
}

export default useDanmu;
