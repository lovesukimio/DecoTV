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

export interface DanmuLoadMeta {
  source: 'init' | 'cache' | 'network' | 'network-retry' | 'empty' | 'error';
  loadedAt: number | null;
  count: number;
}

export interface UseDanmuResult {
  danmuList: DanmuItem[];
  loading: boolean;
  error: Error | null;
  settings: DanmuSettings;
  matchInfo: DanmuMatchInfo | null;
  loadMeta: DanmuLoadMeta;
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
  const [loadMeta, setLoadMeta] = useState<DanmuLoadMeta>({
    source: 'init',
    loadedAt: null,
    count: 0,
  });

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
    async (options?: {
      force?: boolean;
      retryOnEmpty?: boolean;
    }): Promise<number> => {
      const force = options?.force === true;
      const retryOnEmpty = options?.retryOnEmpty !== false;
      const cacheKey = getCacheKey();

      const applyResult = (
        danmus: DanmuItem[],
        match: DanmuMatchInfo | null,
        source: DanmuLoadMeta['source'],
      ) => {
        const now = Date.now();
        setDanmuList(danmus);
        setMatchInfo(match);
        setLoadMeta({ source, loadedAt: now, count: danmus.length });
        if (danmus.length > 0) {
          lastFetchKeyRef.current = cacheKey;
        }

        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              data: danmus,
              match: match || null,
              timestamp: now,
            }),
          );
        } catch {
          // ignore cache write error
        }
      };

      const fetchFromApi = async (forceRefresh: boolean) => {
        const queryParams = new URLSearchParams();
        if (doubanId) queryParams.set('douban_id', String(doubanId));
        if (title) queryParams.set('title', title);
        if (year) queryParams.set('year', year);
        if (episode) queryParams.set('episode', String(episode));
        if (forceRefresh) queryParams.set('force', '1');

        const response = await fetch(
          `/api/danmu-external?${queryParams.toString()}`,
          {
            cache: forceRefresh ? 'no-store' : 'default',
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch danmu: ${response.status}`);
        }

        const data = await response.json();
        if (data.code !== 200 || !Array.isArray(data.danmus)) {
          return {
            danmus: [] as DanmuItem[],
            match: null as DanmuMatchInfo | null,
          };
        }

        return {
          danmus: data.danmus as DanmuItem[],
          match: (data.match || null) as DanmuMatchInfo | null,
        };
      };

      if (!cacheKey) {
        setDanmuList([]);
        setMatchInfo(null);
        setLoadMeta({ source: 'empty', loadedAt: Date.now(), count: 0 });
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
              const cachedDanmu = Array.isArray(parsedCache.data)
                ? (parsedCache.data as DanmuItem[])
                : [];
              const cachedMatch = (parsedCache.match ||
                null) as DanmuMatchInfo | null;
              setDanmuList(cachedDanmu);
              setMatchInfo(cachedMatch);
              setLoadMeta({
                source: 'cache',
                loadedAt: parsedCache.timestamp,
                count: cachedDanmu.length,
              });
              lastFetchKeyRef.current = cacheKey;
              console.log('[useDanmu] Cache hit:', cachedDanmu.length, 'danmu');
              return cachedDanmu.length;
            }
          }
        } catch {
          // ignore cache parse error
        }
      }

      setLoading(true);
      setError(null);

      try {
        const primaryResult = await fetchFromApi(force);
        if (primaryResult.danmus.length > 0) {
          applyResult(primaryResult.danmus, primaryResult.match, 'network');
          console.log(
            '[useDanmu] Fetched:',
            primaryResult.danmus.length,
            'danmu',
            primaryResult.match
              ? `-> ${primaryResult.match.animeTitle} [${primaryResult.match.episodeTitle}]`
              : '',
          );
          return primaryResult.danmus.length;
        }

        // Empty result can be transient; do one forced retry to reduce false negatives.
        if (!force && retryOnEmpty) {
          const retryResult = await fetchFromApi(true);
          if (retryResult.danmus.length > 0) {
            applyResult(retryResult.danmus, retryResult.match, 'network-retry');
            console.log(
              '[useDanmu] Retry fetched:',
              retryResult.danmus.length,
              'danmu',
            );
            return retryResult.danmus.length;
          }
          applyResult([], retryResult.match, 'empty');
          return 0;
        }

        applyResult([], primaryResult.match, 'empty');
        return 0;
      } catch (err) {
        console.error('[useDanmu] Fetch error:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to load danmu'),
        );
        setDanmuList([]);
        setMatchInfo(null);
        setLoadMeta({ source: 'error', loadedAt: Date.now(), count: 0 });
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
    return fetchDanmu({ force: true, retryOnEmpty: false });
  }, [fetchDanmu, getCacheKey]);

  const clear = useCallback(() => {
    setDanmuList([]);
    setMatchInfo(null);
    setLoadMeta({ source: 'init', loadedAt: null, count: 0 });
    lastFetchKeyRef.current = '';
  }, []);

  return {
    danmuList,
    loading,
    error,
    settings,
    matchInfo,
    loadMeta,
    updateSettings,
    reload,
    clear,
  };
}

export default useDanmu;
