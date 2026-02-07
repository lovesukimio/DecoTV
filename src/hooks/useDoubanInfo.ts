/* eslint-disable no-console */
'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  fetchDoubanMovieFromProxy,
  fetchDoubanRecommendsFromProxy,
  fetchDoubanCommentsFromProxy,
  transformMovieDetail,
  transformRecommendations,
  transformComments,
} from '@/services/doubanApi';

// ============================================================================
// Types
// ============================================================================

/** 演员/导演信息 */
export interface DoubanCelebrity {
  id: string;
  name: string;
  alt?: string;
  avatars?: {
    small: string;
    medium: string;
    large: string;
  };
  roles?: string[];
}

/** 电影详情 */
export interface DoubanMovieDetail {
  id: string;
  title: string;
  original_title?: string;
  alt?: string;
  rating?: {
    max: number;
    average: number;
    stars: string;
    min: number;
  };
  ratings_count?: number;
  wish_count?: number;
  collect_count?: number;
  images?: {
    small: string;
    medium: string;
    large: string;
  };
  subtype?: string;
  directors?: DoubanCelebrity[];
  casts?: DoubanCelebrity[];
  writers?: DoubanCelebrity[];
  pubdates?: string[];
  year?: string;
  genres?: string[];
  countries?: string[];
  mainland_pubdate?: string;
  aka?: string[];
  summary?: string;
  tags?: Array<{ name: string; count: number }>;
  durations?: string[];
  seasons_count?: number;
  episodes_count?: number;
}

/** 用户评论 */
export interface DoubanComment {
  id: string;
  created_at: string;
  content: string;
  useful_count: number;
  rating?: {
    max: number;
    value: number;
    min: number;
  } | null;
  author: {
    id: string;
    uid: string;
    name: string;
    avatar: string;
    alt?: string;
  };
}

/** 评论列表响应 */
export interface DoubanCommentsResponse {
  start: number;
  count: number;
  total: number;
  comments: DoubanComment[];
}

/** 推荐影片 */
export interface DoubanRecommend {
  id: string;
  title: string;
  poster?: string;
  rate?: string;
  year?: string;
}

/** Hook 返回类型 */
export interface UseDoubanInfoResult {
  // 详情数据
  detail: DoubanMovieDetail | null;
  detailLoading: boolean;
  detailError: Error | null;

  // 评论数据
  comments: DoubanComment[];
  commentsLoading: boolean;
  commentsError: Error | null;
  commentsTotal: number;

  // 推荐数据
  recommends: DoubanRecommend[];
  recommendsLoading: boolean;
  recommendsError: Error | null;

  // 刷新函数
  refreshDetail: () => Promise<void>;
  refreshComments: () => Promise<void>;
  refreshRecommends: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * 豆瓣信息 Hook
 *
 * 使用前端直接请求豆瓣代理服务，即使服务器在海外也能正常工作
 *
 * @param doubanId - 豆瓣电影 ID
 * @param options - 配置选项
 */
export function useDoubanInfo(
  doubanId: string | number | null | undefined,
  options: {
    /** 是否自动获取详情，默认 true */
    fetchDetail?: boolean;
    /** 是否自动获取评论，默认 true */
    fetchComments?: boolean;
    /** 是否自动获取推荐，默认 true */
    fetchRecommends?: boolean;
    /** 评论数量，默认 20 */
    commentsCount?: number;
  } = {},
): UseDoubanInfoResult {
  const {
    fetchDetail: shouldFetchDetail = true,
    fetchComments: shouldFetchComments = true,
    fetchRecommends: shouldFetchRecommends = true,
    commentsCount = 20,
  } = options;

  // 详情状态
  const [detail, setDetail] = useState<DoubanMovieDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<Error | null>(null);

  // 评论状态
  const [comments, setComments] = useState<DoubanComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<Error | null>(null);
  const [commentsTotal, setCommentsTotal] = useState(0);

  // 推荐状态
  const [recommends, setRecommends] = useState<DoubanRecommend[]>([]);
  const [recommendsLoading, setRecommendsLoading] = useState(false);
  const [recommendsError, setRecommendsError] = useState<Error | null>(null);

  // 获取详情 - 使用前端直接请求
  const refreshDetail = useCallback(async () => {
    if (!doubanId) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      console.log('[useDoubanInfo] 前端直接获取详情:', doubanId);
      const rawData = await fetchDoubanMovieFromProxy(doubanId);
      const transformedData = transformMovieDetail(rawData);

      if (transformedData) {
        setDetail(transformedData as DoubanMovieDetail);
        console.log('[useDoubanInfo] 详情获取成功:', transformedData.title);
      } else {
        throw new Error('无法获取豆瓣数据');
      }
    } catch (error) {
      console.error('[useDoubanInfo] 详情获取失败:', error);
      setDetailError(error instanceof Error ? error : new Error('未知错误'));
    } finally {
      setDetailLoading(false);
    }
  }, [doubanId]);

  // 获取评论 - 使用前端直接请求
  const refreshComments = useCallback(async () => {
    if (!doubanId) return;

    setCommentsLoading(true);
    setCommentsError(null);

    try {
      console.log('[useDoubanInfo] 前端直接获取评论:', doubanId);
      const rawComments = await fetchDoubanCommentsFromProxy(
        doubanId,
        commentsCount,
      );
      const transformedComments = transformComments(rawComments);

      setComments(transformedComments as DoubanComment[]);
      setCommentsTotal(transformedComments.length);
      console.log(
        '[useDoubanInfo] 评论获取成功:',
        transformedComments.length,
        '条',
      );
    } catch (error) {
      console.error('[useDoubanInfo] 评论获取失败:', error);
      setCommentsError(error instanceof Error ? error : new Error('未知错误'));
    } finally {
      setCommentsLoading(false);
    }
  }, [doubanId, commentsCount]);

  // 获取推荐 - 使用前端直接请求
  const refreshRecommends = useCallback(async () => {
    if (!doubanId) return;

    setRecommendsLoading(true);
    setRecommendsError(null);

    try {
      console.log('[useDoubanInfo] 前端直接获取推荐:', doubanId);
      const rawRecommends = await fetchDoubanRecommendsFromProxy(doubanId);
      const transformedRecommends = transformRecommendations(rawRecommends);

      setRecommends(transformedRecommends as DoubanRecommend[]);
      console.log(
        '[useDoubanInfo] 推荐获取成功:',
        transformedRecommends.length,
        '个',
      );
    } catch (error) {
      console.error('[useDoubanInfo] 推荐获取失败:', error);
      setRecommendsError(
        error instanceof Error ? error : new Error('未知错误'),
      );
    } finally {
      setRecommendsLoading(false);
    }
  }, [doubanId]);

  // 初始化加载
  useEffect(() => {
    if (!doubanId) {
      // 重置状态
      setDetail(null);
      setComments([]);
      setCommentsTotal(0);
      setRecommends([]);
      return;
    }

    // 并行请求
    const promises: Promise<void>[] = [];

    if (shouldFetchDetail) {
      promises.push(refreshDetail());
    }

    if (shouldFetchComments) {
      promises.push(refreshComments());
    }

    if (shouldFetchRecommends) {
      promises.push(refreshRecommends());
    }

    Promise.allSettled(promises);
  }, [
    doubanId,
    shouldFetchDetail,
    shouldFetchComments,
    shouldFetchRecommends,
    refreshDetail,
    refreshComments,
    refreshRecommends,
  ]);

  return {
    detail,
    detailLoading,
    detailError,
    comments,
    commentsLoading,
    commentsError,
    commentsTotal,
    recommends,
    recommendsLoading,
    recommendsError,
    refreshDetail,
    refreshComments,
    refreshRecommends,
  };
}

export default useDoubanInfo;
