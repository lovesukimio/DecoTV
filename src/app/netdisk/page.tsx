'use client';

import {
  Copy,
  Database,
  ExternalLink,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';

type SortMode = 'relevance' | 'newest' | 'oldest';
type FileTypeFilter =
  | 'all'
  | 'video'
  | 'subtitle'
  | 'document'
  | 'archive'
  | 'audio'
  | 'image'
  | 'other';
type TimeRangeFilter = 'all' | '24h' | '7d' | '30d' | '90d' | '1y';
type SourceType = 'all' | 'plugin' | 'tg';

interface PanSouSearchItem {
  id: string;
  title: string;
  url: string;
  password: string;
  cloudType: string;
  source: string;
  datetime: string | null;
  fileType: FileTypeFilter;
  images: string[];
}

const CLOUD_TYPES = [
  'baidu',
  'aliyun',
  'quark',
  'uc',
  'xunlei',
  'tianyi',
  '115',
  '123',
];

const SOURCE_OPTIONS: Array<{ value: SourceType; label: string }> = [
  { value: 'all', label: '全源' },
  { value: 'plugin', label: '插件源' },
  { value: 'tg', label: 'TG 源' },
];

function NetdiskPageClient() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<PanSouSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortMode>('relevance');
  const [fileType, setFileType] = useState<FileTypeFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [sourceType, setSourceType] = useState<SourceType>('all');
  const [selectedCloudTypes, setSelectedCloudTypes] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [cacheState, setCacheState] = useState<'hit' | 'miss' | ''>('');

  const cloudTypesParam = useMemo(
    () => selectedCloudTypes.join(','),
    [selectedCloudTypes],
  );

  const toggleCloudType = (cloudType: string) => {
    setSelectedCloudTypes((prev) => {
      if (prev.includes(cloudType)) {
        return prev.filter((item) => item !== cloudType);
      }
      return [...prev, cloudType];
    });
  };

  const handleSearch = async (forceRefresh = false) => {
    const keyword = query.trim();
    if (!keyword) return;

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        q: keyword,
        source: sourceType,
        sort,
        file_type: fileType,
        time_range: timeRange,
        limit: '120',
      });
      if (cloudTypesParam) {
        params.set('cloud_types', cloudTypesParam);
      }
      if (forceRefresh) {
        params.set('refresh', '1');
      }

      const response = await fetch(`/api/pansou?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '网盘搜索失败');
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setLastUpdatedAt(data.updated_at || '');
      setCacheState(
        typeof data.cache === 'string' && data.cache.startsWith('hit')
          ? 'hit'
          : 'miss',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '网盘搜索失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout activePath='/netdisk'>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        <div className='mx-auto w-full max-w-6xl space-y-6'>
          <section className='rounded-2xl border border-cyan-400/20 bg-linear-to-r from-slate-900/90 to-cyan-950/55 p-5 shadow-[0_18px_48px_-28px_rgba(6,182,212,0.8)] backdrop-blur-xl'>
            <div className='mb-4 flex items-center justify-between gap-3'>
              <div>
                <h1 className='text-2xl font-bold text-cyan-200'>
                  PanSou 网盘聚合搜索
                </h1>
                <p className='text-sm text-slate-300'>
                  支持阿里云盘 / 夸克 / 百度网盘等多源检索
                </p>
              </div>
              {lastUpdatedAt && (
                <span className='text-xs text-slate-300'>
                  最近更新: {new Date(lastUpdatedAt).toLocaleString('zh-CN')}
                </span>
              )}
            </div>

            <div className='flex flex-col gap-3 sm:flex-row'>
              <div className='relative flex-1'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
                <input
                  type='text'
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleSearch();
                    }
                  }}
                  placeholder='输入资源关键词，例如：哈利波特 合集'
                  className='h-11 w-full rounded-xl border border-slate-600/70 bg-slate-900/55 pl-10 pr-3 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400/70'
                />
              </div>
              <button
                type='button'
                onClick={() => void handleSearch()}
                disabled={loading}
                className='inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60'
              >
                {loading ? (
                  <RefreshCw className='h-4 w-4 animate-spin' />
                ) : (
                  <Search className='h-4 w-4' />
                )}
                搜索
              </button>
              <button
                type='button'
                onClick={() => void handleSearch(true)}
                disabled={loading}
                className='inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-medium text-slate-100 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60'
              >
                <RefreshCw className='h-4 w-4' />
                强制刷新
              </button>
            </div>

            <div className='mt-3 flex items-center gap-2'>
              <span className='inline-flex items-center gap-1 text-xs text-slate-300'>
                <Database className='h-3.5 w-3.5 text-cyan-300' />
                搜索源
              </span>
              <div className='flex flex-wrap items-center gap-2'>
                {SOURCE_OPTIONS.map((option) => {
                  const active = sourceType === option.value;
                  return (
                    <button
                      key={option.value}
                      type='button'
                      onClick={() => setSourceType(option.value)}
                      className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                        active
                          ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                          : 'border-slate-600/80 bg-slate-800/60 text-slate-200 hover:border-cyan-400/55'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className='rounded-2xl border border-white/10 bg-slate-900/65 p-4 backdrop-blur-xl'>
            <div className='mb-3 flex items-center gap-2 text-sm font-medium text-slate-200'>
              <SlidersHorizontal className='h-4 w-4 text-cyan-300' />
              高级筛选
            </div>
            <div className='grid gap-3 sm:grid-cols-3'>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className='h-10 rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/70'
              >
                <option value='relevance'>按相关度</option>
                <option value='newest'>按时间（最新）</option>
                <option value='oldest'>按时间（最早）</option>
              </select>
              <select
                value={fileType}
                onChange={(event) =>
                  setFileType(event.target.value as FileTypeFilter)
                }
                className='h-10 rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/70'
              >
                <option value='all'>全部文件类型</option>
                <option value='video'>视频</option>
                <option value='subtitle'>字幕</option>
                <option value='document'>文档</option>
                <option value='archive'>压缩包</option>
                <option value='audio'>音频</option>
                <option value='image'>图片</option>
                <option value='other'>其他</option>
              </select>
              <select
                value={timeRange}
                onChange={(event) =>
                  setTimeRange(event.target.value as TimeRangeFilter)
                }
                className='h-10 rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/70'
              >
                <option value='all'>全部时间</option>
                <option value='24h'>24 小时内</option>
                <option value='7d'>7 天内</option>
                <option value='30d'>30 天内</option>
                <option value='90d'>90 天内</option>
                <option value='1y'>1 年内</option>
              </select>
            </div>

            <div className='mt-3 flex flex-wrap gap-2'>
              {CLOUD_TYPES.map((cloudType) => {
                const active = selectedCloudTypes.includes(cloudType);
                return (
                  <button
                    key={cloudType}
                    type='button'
                    onClick={() => toggleCloudType(cloudType)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                      active
                        ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                        : 'border-slate-600/80 bg-slate-800/60 text-slate-200 hover:border-cyan-400/55'
                    }`}
                  >
                    {cloudType}
                  </button>
                );
              })}
            </div>
          </section>

          <section className='rounded-2xl border border-white/10 bg-slate-900/65 p-4 backdrop-blur-xl'>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <h2 className='text-lg font-semibold text-slate-100'>
                搜索结果
                <span className='ml-2 text-sm font-normal text-slate-400'>
                  {total} 条
                </span>
              </h2>
              {cacheState && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    cacheState === 'hit'
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-cyan-500/20 text-cyan-200'
                  }`}
                >
                  缓存: {cacheState}
                </span>
              )}
            </div>

            {error && (
              <div className='mb-3 rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-sm text-red-200'>
                {error}
              </div>
            )}

            {loading ? (
              <div className='flex h-28 items-center justify-center text-sm text-slate-300'>
                <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                正在聚合检索...
              </div>
            ) : items.length === 0 ? (
              <div className='py-10 text-center text-sm text-slate-300'>
                暂无结果，试试调整关键词或筛选条件
              </div>
            ) : (
              <div className='space-y-3'>
                {items.map((item) => (
                  <article
                    key={item.id}
                    className='rounded-xl border border-white/10 bg-white/5 p-3'
                  >
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <h3 className='line-clamp-2 text-sm font-medium text-slate-100 sm:text-base'>
                          {item.title}
                        </h3>
                        <div className='mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300'>
                          <span className='rounded bg-cyan-500/15 px-2 py-0.5 text-cyan-100'>
                            {item.cloudType}
                          </span>
                          <span>{item.fileType}</span>
                          {item.datetime && (
                            <span>
                              {new Date(item.datetime).toLocaleString('zh-CN')}
                            </span>
                          )}
                          <span>{item.source}</span>
                        </div>
                        {item.password && (
                          <p className='mt-1 text-xs text-amber-200'>
                            提取码: {item.password}
                          </p>
                        )}
                      </div>

                      <div className='flex items-center gap-1.5'>
                        <button
                          type='button'
                          onClick={() => {
                            void navigator.clipboard.writeText(item.url);
                          }}
                          className='inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/10'
                        >
                          <Copy className='h-3.5 w-3.5' />
                          复制
                        </button>
                        <a
                          href={item.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='inline-flex items-center gap-1 rounded-lg border border-cyan-400/35 px-2 py-1 text-xs text-cyan-100 transition hover:bg-cyan-500/15'
                        >
                          <ExternalLink className='h-3.5 w-3.5' />
                          打开
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

export default function NetdiskPage() {
  return (
    <Suspense>
      <NetdiskPageClient />
    </Suspense>
  );
}
