'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface BrowseVideoItem {
  vod_id?: string | number;
  vod_name?: string;
  vod_pic?: string;
  vod_year?: string;
  vod_remarks?: string;
}

interface SourceVideoListResponse {
  list?: BrowseVideoItem[];
  page?: number | string;
  pagecount?: number | string;
  total?: number | string;
  limit?: number | string;
  page_size?: number | string;
}

interface UseBrowseVideosOptions {
  sourceKey?: string;
  sourceApi?: string | null;
  categoryId?: string;
  enabled?: boolean;
  defaultPageSize?: number;
}

interface UseBrowseVideosResult {
  videos: BrowseVideoItem[];
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string;
  loadMore: () => void;
  reload: () => void;
}

function buildCategoryApiUrl(
  api: string,
  categoryId: string,
  page: number,
): string {
  if (api.endsWith('/')) {
    return `${api}?ac=videolist&t=${encodeURIComponent(categoryId)}&pg=${page}`;
  }
  return `${api}/?ac=videolist&t=${encodeURIComponent(categoryId)}&pg=${page}`;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function inferHasMore(
  payload: SourceVideoListResponse,
  requestedPage: number,
  fetchedCount: number,
  defaultPageSize: number,
): boolean {
  const pageCount = parsePositiveInteger(payload.pagecount);
  if (pageCount !== null) {
    return requestedPage < pageCount;
  }

  const total = parsePositiveInteger(payload.total);
  const pageSize =
    parsePositiveInteger(payload.limit) ??
    parsePositiveInteger(payload.page_size) ??
    defaultPageSize;

  if (total !== null) {
    return requestedPage * pageSize < total;
  }

  return fetchedCount >= pageSize;
}

function mergeUniqueItems(
  previous: BrowseVideoItem[],
  incoming: BrowseVideoItem[],
): BrowseVideoItem[] {
  const map = new Map<string, BrowseVideoItem>();
  [...previous, ...incoming].forEach((item, index) => {
    const key = String(item.vod_id || item.vod_name || `item-${index}`);
    map.set(key, item);
  });
  return Array.from(map.values());
}

export default function useBrowseVideos({
  sourceKey,
  sourceApi,
  categoryId,
  enabled = true,
  defaultPageSize = 20,
}: UseBrowseVideosOptions): UseBrowseVideosResult {
  const [videos, setVideos] = useState<BrowseVideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const latestQueryKeyRef = useRef('');

  const queryKey = useMemo(
    () => `${sourceKey || 'auto'}::${categoryId || ''}`,
    [sourceKey, categoryId],
  );

  const resetState = useCallback(() => {
    setVideos([]);
    setPage(1);
    setHasMore(true);
    setIsLoading(false);
    setIsLoadingMore(false);
    setError('');
  }, []);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      if (
        !enabled ||
        sourceKey === 'auto' ||
        !sourceApi ||
        !categoryId ||
        !queryKey
      ) {
        return;
      }

      const isLoadMore = targetPage > 1;
      const requestSequence = ++requestSequenceRef.current;

      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;

      if (isLoadMore) {
        loadMoreLockRef.current = true;
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError('');

      try {
        const originalApiUrl = buildCategoryApiUrl(
          sourceApi,
          categoryId,
          targetPage,
        );
        const proxyUrl = `/api/proxy/cms?url=${encodeURIComponent(originalApiUrl)}`;
        const response = await fetch(proxyUrl, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`分类内容拉取失败 (${response.status})`);
        }

        const payload = (await response.json()) as SourceVideoListResponse;
        const nextItems = Array.isArray(payload.list) ? payload.list : [];
        const nextHasMore = inferHasMore(
          payload,
          targetPage,
          nextItems.length,
          defaultPageSize,
        );

        if (
          controller.signal.aborted ||
          requestSequence !== requestSequenceRef.current ||
          latestQueryKeyRef.current !== queryKey
        ) {
          return;
        }

        setPage(targetPage);
        setHasMore(nextHasMore);
        setVideos((previous) =>
          isLoadMore ? mergeUniqueItems(previous, nextItems) : nextItems,
        );
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        if (!isLoadMore) {
          setVideos([]);
          setHasMore(false);
        }

        setError(
          err instanceof Error ? err.message : '分类内容拉取失败，请稍后重试',
        );
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        if (isLoadMore) {
          loadMoreLockRef.current = false;
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [categoryId, defaultPageSize, enabled, queryKey, sourceApi, sourceKey],
  );

  const loadMore = useCallback(() => {
    if (!enabled || sourceKey === 'auto' || !sourceApi || !categoryId) {
      return;
    }
    if (isLoading || isLoadingMore || !hasMore || loadMoreLockRef.current) {
      return;
    }
    void fetchPage(page + 1);
  }, [
    categoryId,
    enabled,
    fetchPage,
    hasMore,
    isLoading,
    isLoadingMore,
    page,
    sourceApi,
    sourceKey,
  ]);

  const reload = useCallback(() => {
    if (!enabled || sourceKey === 'auto' || !sourceApi || !categoryId) {
      return;
    }
    void fetchPage(1);
  }, [categoryId, enabled, fetchPage, sourceApi, sourceKey]);

  useEffect(() => {
    latestQueryKeyRef.current = queryKey;
    requestControllerRef.current?.abort();
    requestSequenceRef.current += 1;
    loadMoreLockRef.current = false;

    resetState();

    if (!enabled || sourceKey === 'auto' || !sourceApi || !categoryId) {
      setHasMore(false);
      return;
    }

    void fetchPage(1);

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [
    categoryId,
    enabled,
    fetchPage,
    queryKey,
    resetState,
    sourceApi,
    sourceKey,
  ]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
    };
  }, []);

  return {
    videos,
    page,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    reload,
  };
}
