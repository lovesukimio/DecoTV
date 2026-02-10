'use client';

import { CheckCircle2, Loader2, Search, Sparkles } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { type SourceCategory, useSourceFilter } from '@/hooks/useSourceFilter';

import SourceBrowserIcon from '@/components/icons/SourceBrowserIcon';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface SourceVideoItem {
  vod_id?: string | number;
  vod_name?: string;
  vod_pic?: string;
  vod_year?: string;
  vod_remarks?: string;
}

interface SourceVideoListResponse {
  list?: SourceVideoItem[];
  class?: SourceCategory[];
  msg?: string;
}

function buildCategoryApiUrl(api: string, categoryId: string): string {
  if (api.endsWith('/')) {
    return `${api}?ac=videolist&t=${encodeURIComponent(categoryId)}&pg=1`;
  }
  return `${api}/?ac=videolist&t=${encodeURIComponent(categoryId)}&pg=1`;
}

function SourceBrowserPageClient() {
  const {
    sources,
    currentSource,
    setCurrentSource,
    sourceCategories,
    isLoadingSources,
    isLoadingCategories,
    error,
  } = useSourceFilter();
  const [keyword, setKeyword] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categoryItems, setCategoryItems] = useState<SourceVideoItem[]>([]);
  const [isLoadingCategoryItems, setIsLoadingCategoryItems] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredSources = useMemo(() => {
    if (!normalizedKeyword) return sources;
    return sources.filter((source) => {
      return (
        source.name.toLowerCase().includes(normalizedKeyword) ||
        source.key.toLowerCase().includes(normalizedKeyword) ||
        source.api.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [sources, normalizedKeyword]);

  const sourceCount = sources.length + 1;
  const currentSourceConfig = useMemo(() => {
    return sources.find((source) => source.key === currentSource) || null;
  }, [currentSource, sources]);
  const currentSourceName =
    currentSource === 'auto'
      ? '聚合模式'
      : currentSourceConfig?.name || currentSource;

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    return (
      sourceCategories.find(
        (category) => String(category.type_id) === selectedCategoryId,
      ) || null
    );
  }, [selectedCategoryId, sourceCategories]);

  const fetchCategoryItems = useCallback(
    async (categoryId: string) => {
      if (currentSource === 'auto' || !currentSourceConfig) {
        setCategoryItems([]);
        setCategoryError('');
        return;
      }

      setIsLoadingCategoryItems(true);
      setCategoryError('');
      try {
        const originalApiUrl = buildCategoryApiUrl(
          currentSourceConfig.api,
          categoryId,
        );
        const proxyUrl = `/api/proxy/cms?url=${encodeURIComponent(originalApiUrl)}`;
        const response = await fetch(proxyUrl, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`分类内容拉取失败 (${response.status})`);
        }

        const payload = (await response.json()) as SourceVideoListResponse;
        setCategoryItems(Array.isArray(payload.list) ? payload.list : []);
      } catch (err) {
        setCategoryItems([]);
        setCategoryError(
          err instanceof Error ? err.message : '分类内容拉取失败，请稍后重试',
        );
      } finally {
        setIsLoadingCategoryItems(false);
      }
    },
    [currentSource, currentSourceConfig],
  );

  useEffect(() => {
    setCategoryItems([]);
    setCategoryError('');
    if (currentSource === 'auto') {
      setSelectedCategoryId('');
    }
  }, [currentSource]);

  useEffect(() => {
    if (currentSource === 'auto' || sourceCategories.length === 0) {
      setSelectedCategoryId('');
      return;
    }

    const stillExists = sourceCategories.some(
      (category) => String(category.type_id) === selectedCategoryId,
    );
    if (!stillExists) {
      setSelectedCategoryId(String(sourceCategories[0].type_id));
    }
  }, [currentSource, selectedCategoryId, sourceCategories]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    void fetchCategoryItems(selectedCategoryId);
  }, [selectedCategoryId, fetchCategoryItems]);

  return (
    <PageLayout activePath='/source-browser'>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        <div className='mx-auto w-full max-w-6xl space-y-6'>
          <section className='rounded-3xl border border-emerald-400/20 bg-linear-to-r from-slate-900/80 via-slate-900/65 to-emerald-950/45 p-5 shadow-[0_15px_50px_-25px_rgba(16,185,129,0.65)] backdrop-blur-xl sm:p-7'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <div className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-300/40'>
                  <SourceBrowserIcon className='h-6 w-6' />
                </div>
                <div>
                  <h1 className='text-2xl font-extrabold tracking-tight text-emerald-300'>
                    源浏览器
                  </h1>
                  <p className='text-sm text-slate-300/90'>
                    统一管理数据源，一次选择，全站联动。
                  </p>
                </div>
              </div>
              <span className='inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/30'>
                {sourceCount} 个可用源
              </span>
            </div>

            <div className='mt-4 grid gap-3 sm:grid-cols-2'>
              <label className='relative'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder='按源名称/标识筛选...'
                  className='h-10 w-full rounded-xl border border-slate-600/60 bg-slate-900/40 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400/60'
                />
              </label>
              <div className='flex items-center justify-between rounded-xl border border-slate-600/60 bg-slate-900/40 px-4 text-sm text-slate-200'>
                <span className='inline-flex items-center gap-2 text-slate-300'>
                  <Sparkles className='h-4 w-4 text-emerald-300' />
                  当前生效
                </span>
                <span className='font-semibold text-emerald-200'>
                  {currentSourceName}
                </span>
              </div>
            </div>
          </section>

          <section className='rounded-2xl border border-white/10 bg-slate-900/55 p-4 shadow-[0_12px_38px_-28px_rgba(14,165,233,0.7)] backdrop-blur-xl sm:p-5'>
            <div className='mb-3 flex items-center justify-between'>
              <h2 className='text-sm font-semibold text-slate-200'>
                选择资源站
              </h2>
              {isLoadingSources && (
                <span className='text-xs text-slate-400'>加载中...</span>
              )}
            </div>

            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                onClick={() => setCurrentSource('auto')}
                className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                  currentSource === 'auto'
                    ? 'border-emerald-300/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-600/70 bg-slate-800/50 text-slate-200 hover:border-emerald-400/50'
                }`}
              >
                聚合
              </button>

              {filteredSources.map((source) => {
                const active = currentSource === source.key;
                return (
                  <button
                    key={source.key}
                    type='button'
                    onClick={() => setCurrentSource(source.key)}
                    className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                      active
                        ? 'border-emerald-300/60 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-600/70 bg-slate-800/50 text-slate-200 hover:border-emerald-400/50'
                    }`}
                  >
                    {source.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className='rounded-2xl border border-white/10 bg-slate-900/55 p-4 backdrop-blur-xl sm:p-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold text-slate-200'>
                  当前源分类浏览
                </h3>
                <p className='mt-1 text-xs text-slate-400'>
                  自动读取当前源 class
                  分类，点击后在当前页筛选，不跳转其他页面。
                </p>
              </div>
              {currentSource !== 'auto' && selectedCategory && (
                <span className='inline-flex items-center gap-1 text-xs text-emerald-200'>
                  <CheckCircle2 className='h-4 w-4' />
                  已选分类: {selectedCategory.type_name}
                </span>
              )}
            </div>

            {currentSource === 'auto' ? (
              <div className='mt-3 rounded-xl border border-dashed border-slate-600/70 bg-slate-800/35 px-4 py-6 text-center text-sm text-slate-300'>
                请选择一个具体数据源后再浏览分类内容。
              </div>
            ) : (
              <>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {isLoadingCategories ? (
                    <div className='inline-flex items-center gap-1 text-sm text-slate-300'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      正在读取分类...
                    </div>
                  ) : sourceCategories.length === 0 ? (
                    <div className='text-sm text-amber-200'>
                      当前源未返回分类数据，请检查源接口。
                    </div>
                  ) : (
                    sourceCategories.map((category) => {
                      const categoryId = String(category.type_id);
                      const active = selectedCategoryId === categoryId;
                      return (
                        <button
                          key={categoryId}
                          type='button'
                          onClick={() => setSelectedCategoryId(categoryId)}
                          className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                            active
                              ? 'border-emerald-300/60 bg-emerald-500/20 text-emerald-200'
                              : 'border-slate-600/70 bg-slate-800/50 text-slate-200 hover:border-emerald-400/50'
                          }`}
                        >
                          {category.type_name}
                        </button>
                      );
                    })
                  )}
                </div>

                {error && (
                  <div className='mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200'>
                    {error}
                  </div>
                )}

                {categoryError && (
                  <div className='mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200'>
                    {categoryError}
                  </div>
                )}

                {isLoadingCategoryItems ? (
                  <div className='mt-4 flex items-center justify-center gap-2 py-8 text-sm text-slate-300'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    正在拉取分类内容...
                  </div>
                ) : categoryItems.length === 0 ? (
                  <div className='mt-4 rounded-xl border border-dashed border-slate-600/70 bg-slate-800/35 px-4 py-8 text-center text-sm text-slate-300'>
                    该分类暂无可展示内容。
                  </div>
                ) : (
                  <div className='mt-4 grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
                    {categoryItems.map((item, index) => (
                      <div
                        key={`${String(item.vod_id || item.vod_name || index)}-${index}`}
                        className='w-full'
                      >
                        <VideoCard
                          id={String(item.vod_id || '')}
                          source={currentSource}
                          source_name={currentSourceName}
                          title={item.vod_name || '未命名资源'}
                          poster={item.vod_pic || ''}
                          year={item.vod_year || ''}
                          from='search'
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

export default function SourceBrowserPage() {
  return (
    <Suspense>
      <SourceBrowserPageClient />
    </Suspense>
  );
}
