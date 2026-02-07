/* eslint-disable no-console */
/**
 * 豆瓣 API 前端直接请求服务
 *
 * 核心思路：让浏览器直接请求豆瓣代理服务，绕过后端服务器
 * 这样即使服务器部署在海外（如 Vercel），用户浏览器仍能正常获取数据
 *
 * 参考 LunaTV 项目：https://github.com/SzeMeng76/LunaTV
 */

// ============================================================================
// 配置
// ============================================================================

// 豆瓣 API 代理服务列表（按优先级排序）
const DOUBAN_API_PROXIES = [
  {
    name: 'uieee',
    baseUrl: 'https://douban.uieee.com',
    // uieee 使用标准豆瓣 API v2 格式
    moviePath: (id: string) => `/v2/movie/subject/${id}`,
    recommendsPath: (id: string) => `/v2/movie/subject/${id}/recommendations`,
    commentsPath: (id: string) => `/v2/movie/subject/${id}/comments`,
    // 无需 apiKey
    needsApiKey: false,
  },
  {
    name: 'frodo',
    baseUrl: 'https://frodo.douban.com/api/v2',
    moviePath: (id: string) => `/movie/${id}`,
    recommendsPath: (id: string) => `/movie/${id}/recommendations`,
    commentsPath: (id: string) => `/movie/${id}/interests`,
    needsApiKey: true,
    apiKey: '0ac44ae016490db2204ce0a042db2916',
  },
];

// 图片代理路径（解决防盗链）
const IMAGE_PROXY_PATH = '/api/image-proxy';

// 请求超时时间
const REQUEST_TIMEOUT = 10000;

// ============================================================================
// 类型定义
// ============================================================================

export interface DoubanApiMovieDetail {
  id: string | number;
  title: string;
  original_title?: string;
  year?: string;
  rating?: {
    max?: number;
    average?: number;
    value?: number;
    stars?: string;
    count?: number;
  };
  ratings_count?: number;
  genres?: string[];
  countries?: string[];
  durations?: string[];
  summary?: string;
  intro?: string;
  pic?: { normal?: string; large?: string };
  images?: { small?: string; medium?: string; large?: string };
  directors?: Array<{
    id?: string;
    name?: string;
    avatar?: string | { normal?: string; large?: string };
  }>;
  actors?: Array<{
    id?: string;
    name?: string;
    avatar?: string | { normal?: string; large?: string };
  }>;
  casts?: Array<{
    id?: string;
    name?: string;
    avatars?: { small?: string; medium?: string; large?: string };
  }>;
}

export interface DoubanApiRecommendation {
  id?: string;
  title?: string;
  pic?: { normal?: string; large?: string };
  rating?: { value?: number };
}

export interface DoubanApiComment {
  id?: string;
  user?: {
    id?: string;
    uid?: string;
    name?: string;
    avatar?: string;
  };
  comment?: string;
  content?: string;
  rating?: { value?: number; max?: number; min?: number };
  vote_count?: number;
  useful_count?: number;
  create_time?: string;
  created_at?: string;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 将豆瓣图片 URL 转换为代理 URL
 */
export function proxyImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  // 如果是豆瓣图片，使用代理
  if (url.includes('doubanio.com') || url.includes('douban.com')) {
    return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * 提取头像 URL
 */
function extractAvatarUrl(avatar: unknown): string {
  if (!avatar) return '';
  if (typeof avatar === 'string') return avatar;
  if (typeof avatar === 'object') {
    const obj = avatar as { normal?: string; large?: string };
    return obj.large || obj.normal || '';
  }
  return '';
}

/**
 * 创建带超时的 fetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = REQUEST_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// API 请求函数
// ============================================================================

/**
 * 从豆瓣 API 代理获取电影详情
 *
 * 使用多代理轮询策略，确保高可用性
 */
export async function fetchDoubanMovieFromProxy(
  doubanId: string | number,
): Promise<DoubanApiMovieDetail | null> {
  const id = String(doubanId);
  const errors: string[] = [];

  for (const proxy of DOUBAN_API_PROXIES) {
    try {
      console.log(`[DoubanAPI] 尝试代理: ${proxy.name}`);

      let url = `${proxy.baseUrl}${proxy.moviePath(id)}`;
      if (proxy.needsApiKey && proxy.apiKey) {
        url += `?apiKey=${proxy.apiKey}`;
      }

      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`[DoubanAPI] ${proxy.name} 成功获取数据`);
      return data as DoubanApiMovieDetail;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[DoubanAPI] ${proxy.name} 失败:`, msg);
      errors.push(`${proxy.name}: ${msg}`);
    }
  }

  console.error('[DoubanAPI] 所有代理都失败:', errors.join(', '));
  return null;
}

/**
 * 从豆瓣 API 代理获取推荐影片
 */
export async function fetchDoubanRecommendsFromProxy(
  doubanId: string | number,
): Promise<DoubanApiRecommendation[]> {
  const id = String(doubanId);

  for (const proxy of DOUBAN_API_PROXIES) {
    try {
      let url = `${proxy.baseUrl}${proxy.recommendsPath(id)}`;
      if (proxy.needsApiKey && proxy.apiKey) {
        url += `?apiKey=${proxy.apiKey}&count=12`;
      } else {
        url += '?count=12';
      }

      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      // 不同 API 返回格式可能不同
      return data.items || data.subjects || data.recommendations || [];
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * 从豆瓣 API 代理获取短评
 */
export async function fetchDoubanCommentsFromProxy(
  doubanId: string | number,
  count = 20,
): Promise<DoubanApiComment[]> {
  const id = String(doubanId);

  for (const proxy of DOUBAN_API_PROXIES) {
    try {
      let url = `${proxy.baseUrl}${proxy.commentsPath(id)}`;
      if (proxy.needsApiKey && proxy.apiKey) {
        url += `?apiKey=${proxy.apiKey}&count=${count}&order_by=hot`;
      } else {
        url += `?count=${count}`;
      }

      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      // 不同 API 返回格式可能不同
      return data.interests || data.comments || [];
    } catch {
      continue;
    }
  }

  return [];
}

// ============================================================================
// 数据转换函数（转换为组件期望的格式）
// ============================================================================

/**
 * 将 API 返回的电影详情转换为组件期望的格式
 */
export function transformMovieDetail(data: DoubanApiMovieDetail | null) {
  if (!data) return null;

  // 处理评分
  const rating = data.rating
    ? {
        max: 10,
        average: data.rating.average || data.rating.value || 0,
        stars: data.rating.stars || '',
        min: 0,
      }
    : null;

  // 处理图片
  const getImage = () => {
    if (data.images) {
      return {
        small: proxyImageUrl(data.images.small),
        medium: proxyImageUrl(data.images.medium || data.images.large),
        large: proxyImageUrl(data.images.large),
      };
    }
    if (data.pic) {
      return {
        small: proxyImageUrl(data.pic.normal),
        medium: proxyImageUrl(data.pic.large || data.pic.normal),
        large: proxyImageUrl(data.pic.large),
      };
    }
    return { small: '', medium: '', large: '' };
  };

  // 处理导演
  const directors = (data.directors || []).map((d) => ({
    id: String(d.id || ''),
    name: d.name || '',
    alt: d.id ? `https://movie.douban.com/celebrity/${d.id}/` : '',
    avatars: d.avatar
      ? {
          small: proxyImageUrl(extractAvatarUrl(d.avatar)),
          medium: proxyImageUrl(extractAvatarUrl(d.avatar)),
          large: proxyImageUrl(extractAvatarUrl(d.avatar)),
        }
      : undefined,
    roles: ['导演'],
  }));

  // 处理演员 - 需要处理两种格式：actors（有 avatar）和 casts（有 avatars）
  type ActorItem = {
    id?: string;
    name?: string;
    avatar?: string | { normal?: string; large?: string };
    avatars?: { small?: string; medium?: string; large?: string };
  };

  const actors = (data.actors || []) as ActorItem[];
  const casts = (data.casts || []) as ActorItem[];
  const allCasts = [...actors, ...casts].map((a) => {
    // 尝试从 avatar 或 avatars 提取头像 URL
    const avatarUrl =
      extractAvatarUrl(a.avatar) ||
      a.avatars?.large ||
      a.avatars?.medium ||
      a.avatars?.small ||
      '';

    return {
      id: String(a.id || ''),
      name: a.name || '',
      alt: a.id ? `https://movie.douban.com/celebrity/${a.id}/` : '',
      avatars: avatarUrl
        ? {
            small: proxyImageUrl(avatarUrl),
            medium: proxyImageUrl(avatarUrl),
            large: proxyImageUrl(avatarUrl),
          }
        : undefined,
      roles: ['演员'],
    };
  });

  return {
    id: String(data.id),
    title: data.title || '',
    original_title: data.original_title || '',
    year: data.year || '',
    rating,
    ratings_count: data.ratings_count || data.rating?.count || 0,
    genres: data.genres || [],
    countries: data.countries || [],
    durations: data.durations || [],
    summary: data.summary || data.intro || '',
    images: getImage(),
    directors,
    casts: allCasts.slice(0, 20), // 最多 20 个演员
  };
}

/**
 * 将 API 返回的推荐影片转换为组件期望的格式
 */
export function transformRecommendations(data: DoubanApiRecommendation[]) {
  return data.map((item) => ({
    id: String(item.id || ''),
    title: item.title || '',
    poster: proxyImageUrl(item.pic?.large || item.pic?.normal),
    rate: item.rating?.value ? String(item.rating.value) : '',
  }));
}

/**
 * 将 API 返回的短评转换为组件期望的格式
 */
export function transformComments(data: DoubanApiComment[]) {
  return data.map((item) => ({
    id: String(item.id || `comment_${Date.now()}_${Math.random()}`),
    created_at: item.create_time || item.created_at || '',
    content: item.comment || item.content || '',
    useful_count: item.vote_count || item.useful_count || 0,
    rating: item.rating?.value
      ? {
          max: item.rating.max || 10,
          value: item.rating.value,
          min: item.rating.min || 0,
        }
      : null,
    author: {
      id: String(item.user?.id || ''),
      uid: item.user?.uid || '',
      name: item.user?.name || '匿名用户',
      avatar: proxyImageUrl(item.user?.avatar),
      alt: item.user?.id
        ? `https://www.douban.com/people/${item.user.id}/`
        : '',
    },
  }));
}
