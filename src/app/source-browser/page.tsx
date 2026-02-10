'use client';

import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Search,
  Sparkles,
  Tv2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { useSourceFilter } from '@/hooks/useSourceFilter';

import SourceBrowserIcon from '@/components/icons/SourceBrowserIcon';
import PageLayout from '@/components/PageLayout';

function SourceBrowserPageClient() {
  const router = useRouter();
  const { sources, currentSource, setCurrentSource, isLoadingSources } =
    useSourceFilter();
  const [keyword, setKeyword] = useState('');

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
  const currentSourceName =
    currentSource === 'auto'
      ? '聚合模式'
      : sources.find((source) => source.key === currentSource)?.name ||
        currentSource;

  const openDoubanType = (type: 'movie' | 'tv' | 'anime' | 'show') => {
    router.push(`/douban?type=${type}`);
  };

  return (
    <PageLayout activePath='/source-browser'>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        <div className='mx-auto w-full max-w-6xl space-y-6'>
          <section className='rounded-3xl border border-emerald-400/20 bg-linear-to-r from-slate-900/80 via-slate-900/65 to-emerald-950/45 p-5 sm:p-7 shadow-[0_15px_50px_-25px_rgba(16,185,129,0.65)] backdrop-blur-xl'>
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
                选择资源源站
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
                  快速进入内容分区
                </h3>
                <p className='mt-1 text-xs text-slate-400'>
                  源站选择已保存，进入电影/剧集/动漫/综艺后自动生效。
                </p>
              </div>
              <span className='inline-flex items-center gap-1 text-xs text-emerald-200'>
                <CheckCircle2 className='h-4 w-4' />
                已启用
              </span>
            </div>
            <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <button
                type='button'
                onClick={() => openDoubanType('movie')}
                className='inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600/70 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 transition hover:border-pink-400/60'
              >
                <Clapperboard className='h-4 w-4' />
                电影
              </button>
              <button
                type='button'
                onClick={() => openDoubanType('tv')}
                className='inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600/70 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 transition hover:border-indigo-400/60'
              >
                <Tv2 className='h-4 w-4' />
                剧集
              </button>
              <button
                type='button'
                onClick={() => openDoubanType('anime')}
                className='inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600/70 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 transition hover:border-emerald-400/60'
              >
                <Sparkles className='h-4 w-4' />
                动漫
              </button>
              <button
                type='button'
                onClick={() => openDoubanType('show')}
                className='inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600/70 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 transition hover:border-amber-400/60'
              >
                综艺
                <ArrowRight className='h-4 w-4' />
              </button>
            </div>
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
