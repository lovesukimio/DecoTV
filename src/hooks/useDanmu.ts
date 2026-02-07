/* eslint-disable no-console */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DanmuItem {
  time: number;
  text: string;
  color?: string;
  mode?: 0 | 1 | 2;
  border?: boolean;
}

export interface DanmuSettings {
  enabled: boolean;
  fontSize: number;
  speed: number;
  opacity: number;
  margin: [number, number];
  modes: number[];
  antiOverlap: boolean;
  visible: boolean;
}

export interface DanmuMatchInfo {
  animeTitle: string;
  episodeTitle: string;
  episodeId: number;
  matchLevel: string;
}

export interface UseDanmuResult {
  danmuList: DanmuItem[];
  loading: boolean;
  error: Error | null;
  settings: DanmuSettings;
  matchInfo: DanmuMatchInfo | null;
  updateSettings: (newSettings: Partial<DanmuSettings>) => void;
  reload: () => Promise<number>;
  clear: () => void;
}

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
  enabled: true,
  fontSize: 25,
  speed: 5,
  opacity: 1,
  margin: [0, 0],
  modes: [0, 1, 2],
  antiOverlap: true,
  visible: true,
};

function loadSettingsFromStorage(): DanmuSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    return {
      enabled: true,
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

interface UseDanmuParams {
  doubanId?: number | string | null;
  title?: string;
  year?: string;
  episode?: number;
}

export function useDanmu(params: UseDanmuParams): UseDanmuResult {
  const { doubanId, title, year, episode } = params;

  const [danmuList, setDanmuList] = useState<DanmuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [settings, setSettings] = useState<DanmuSettings>(DEFAULT_SETTINGS);
  const [matchInfo, setMatchInfo] = useState<DanmuMatchInfo | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchKeyRef = useRef<string>('');

  useEffect(() => {
    setSettings(loadSettingsFromStorage());
  }, []);

  const getCacheKey = useCallback(() => {
    if (doubanId) {
      return `danmu_${doubanId}_${episode || 1}`;
    }
    if (title) {
      return `danmu_${title}_${year || ''}_${episode || 1}`;
    }
    return '';
  }, [doubanId, title, year, episode]);

  const fetchDanmu = useCallback(
    async (options?: { force?: boolean }): Promise<number> => {
      const force = options?.force === true;
      const cacheKey = getCacheKey();

      if (!cacheKey) {
        setDanmuList([]);
        setMatchInfo(null);
        return 0;
      }

      if (
        !force &&
        cacheKey === lastFetchKeyRef.current &&
        danmuList.length > 0
      ) {
        return danmuList.length;
      }

      if (!force) {
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsedCache = JSON.parse(cached);
            if (
              parsedCache.timestamp &&
              Date.now() - parsedCache.timestamp < 2 * 3600 * 1000
            ) {
              setDanmuList(parsedCache.data);
              setMatchInfo(
                (parsedCache.match || null) as DanmuMatchInfo | null,
              );
              lastFetchKeyRef.current = cacheKey;
              console.log(
                '[useDanmu] Cache hit:',
                parsedCache.data.length,
                'danmu',
              );
              return Array.isArray(parsedCache.data)
                ? parsedCache.data.length
                : 0;
            }
          }
        } catch {
          // ignore cache parse error
        }
      }

      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (doubanId) queryParams.set('douban_id', String(doubanId));
        if (title) queryParams.set('title', title);
        if (year) queryParams.set('year', year);
        if (episode) queryParams.set('episode', String(episode));
        if (force) queryParams.set('force', '1');

        const response = await fetch(
          `/api/danmu-external?${queryParams.toString()}`,
          {
            cache: force ? 'no-store' : 'default',
          },
        );

        if (!response.ok) {
          throw new Error(`获取弹幕失败: ${response.status}`);
        }

        const data = await response.json();
        if (data.code === 200 && Array.isArray(data.danmus)) {
          const danmus: DanmuItem[] = data.danmus;
          setDanmuList(danmus);
          lastFetchKeyRef.current = cacheKey;
          setMatchInfo((data.match || null) as DanmuMatchInfo | null);

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
            // ignore cache write error
          }

          console.log(
            '[useDanmu] Fetched:',
            danmus.length,
            'danmu',
            data.match
              ? `-> ${data.match.animeTitle} [${data.match.episodeTitle}]`
              : '',
          );
          return danmus.length;
        }

        setDanmuList([]);
        setMatchInfo(null);
        return 0;
      } catch (err) {
        console.error('[useDanmu] Fetch error:', err);
        setError(err instanceof Error ? err : new Error('加载弹幕失败'));
        setDanmuList([]);
        setMatchInfo(null);
        return 0;
      } finally {
        setLoading(false);
      }
    },
    [doubanId, title, year, episode, getCacheKey, danmuList.length],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchDanmu();
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doubanId, title, year, episode]);

  const updateSettings = useCallback((newSettings: Partial<DanmuSettings>) => {
    setSettings((prev) => {
      const hasChanges = Object.entries(newSettings).some(([key, value]) => {
        const settingKey = key as keyof DanmuSettings;
        return !Object.is(prev[settingKey], value);
      });

      if (!hasChanges) return prev;

      const updated = { ...prev, ...newSettings };
      saveSettingsToStorage(updated);
      return updated;
    });
  }, []);

  const reload = useCallback(async () => {
    lastFetchKeyRef.current = '';
    const cacheKey = getCacheKey();
    if (cacheKey) {
      try {
        sessionStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
    }
    return fetchDanmu({ force: true });
  }, [fetchDanmu, getCacheKey]);

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
