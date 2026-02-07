/* eslint-disable no-console */
'use client';

import { useCallback, useEffect, useState } from 'react';

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
// API 调用函数（使用后端代理）
// ============================================================================

/**
 * 通过后端代理获取豆瓣数据
 * 后端代理位于 /api/douban/proxy，可以绕过 CORS 限制
 */
async function fetchFromBackendProxy(
  path: string,
  timeout = 30000,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `/api/douban/proxy?path=${encodeURIComponent(path)}`;
    console.log('[useDoubanInfo] 请求后端代理:', url);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[useDoubanInfo] 后端代理错误:',
        response.status,
        errorText,
      );
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('[useDoubanInfo] 后端代理响应成功');
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * 豆瓣信息 Hook
 *
 * 使用后端代理获取豆瓣数据，避免 CORS 和网络限制
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

  // 获取详情 - 使用后端代理
  const refreshDetail = useCallback(async () => {
    if (!doubanId) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      console.log('[useDoubanInfo] 获取详情:', doubanId);

      // 调用后端代理获取完整数据
      const data = (await fetchFromBackendProxy(
        `movie/subject/${doubanId}`,
      )) as DoubanMovieDetail & {
        hotComments?: DoubanComment[];
        recommendations?: Array<{
          id: string;
          title: string;
          images?: { small?: string; medium?: string; large?: string };
          alt?: string;
        }>;
      };

      if (data && data.title) {
        setDetail(data);
        console.log('[useDoubanInfo] 详情获取成功:', data.title);

        // 如果后端返回了评论数据，直接使用
        if (data.hotComments && data.hotComments.length > 0) {
          setComments(data.hotComments);
          setCommentsTotal(data.hotComments.length);
          console.log(
            '[useDoubanInfo] 评论已从详情中提取:',
            data.hotComments.length,
            '条',
          );
        }

        // 如果后端返回了推荐数据，直接使用
        if (data.recommendations && data.recommendations.length > 0) {
          const transformedRecommends = data.recommendations.map((r) => ({
            id: r.id,
            title: r.title,
            poster:
              r.images?.large || r.images?.medium || r.images?.small || '',
            rate: '',
          }));
          setRecommends(transformedRecommends);
          console.log(
            '[useDoubanInfo] 推荐已从详情中提取:',
            transformedRecommends.length,
            '个',
          );
        }
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

  // 获取评论 - 使用后端代理（如果详情中没有）
  const refreshComments = useCallback(async () => {
    if (!doubanId) return;

    // 如果已经有评论了（从详情中获取的），就不再请求
    if (comments.length > 0) {
      console.log('[useDoubanInfo] 评论已存在，跳过请求');
      return;
    }

    setCommentsLoading(true);
    setCommentsError(null);

    try {
      console.log('[useDoubanInfo] 获取评论:', doubanId);
      const data = (await fetchFromBackendProxy(
        `movie/subject/${doubanId}/comments`,
      )) as { comments?: DoubanComment[]; total?: number };

      if (data && data.comments) {
        setComments(data.comments);
        setCommentsTotal(data.total || data.comments.length);
        console.log(
          '[useDoubanInfo] 评论获取成功:',
          data.comments.length,
          '条',
        );
      }
    } catch (error) {
      console.error('[useDoubanInfo] 评论获取失败:', error);
      setCommentsError(error instanceof Error ? error : new Error('未知错误'));
    } finally {
      setCommentsLoading(false);
    }
  }, [doubanId, comments.length]);

  // 获取推荐 - 使用后端代理（如果详情中没有）
  const refreshRecommends = useCallback(async () => {
    if (!doubanId) return;

    // 如果已经有推荐了（从详情中获取的），就不再请求
    if (recommends.length > 0) {
      console.log('[useDoubanInfo] 推荐已存在，跳过请求');
      return;
    }

    setRecommendsLoading(true);
    setRecommendsError(null);

    try {
      console.log('[useDoubanInfo] 获取推荐:', doubanId);
      const data = (await fetchFromBackendProxy(
        `movie/subject/${doubanId}/recommendations`,
      )) as {
        recommendations?: Array<{
          id: string;
          title: string;
          images?: { large?: string };
        }>;
      };

      if (data && data.recommendations) {
        const transformedRecommends = data.recommendations.map((r) => ({
          id: r.id,
          title: r.title,
          poster: r.images?.large || '',
          rate: '',
        }));
        setRecommends(transformedRecommends);
        console.log(
          '[useDoubanInfo] 推荐获取成功:',
          transformedRecommends.length,
          '个',
        );
      }
    } catch (error) {
      console.error('[useDoubanInfo] 推荐获取失败:', error);
      setRecommendsError(
        error instanceof Error ? error : new Error('未知错误'),
      );
    } finally {
      setRecommendsLoading(false);
    }
  }, [doubanId, recommends.length]);

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

    // 主要通过 refreshDetail 获取所有数据（包括评论和推荐）
    // 后端一次性返回所有数据，减少请求次数
    if (shouldFetchDetail) {
      refreshDetail();
    }

    // 如果不需要详情但需要评论或推荐，单独请求
    if (!shouldFetchDetail) {
      if (shouldFetchComments) {
        refreshComments();
      }
      if (shouldFetchRecommends) {
        refreshRecommends();
      }
    }
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
