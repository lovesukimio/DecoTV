/* eslint-disable no-console,react-hooks/exhaustive-deps */

'use client';

import { ChevronLeft, ChevronRight, Database, Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ApiSite } from '@/lib/config';

import MultiLevelSelector from './MultiLevelSelector';
import WeekdaySelector from './WeekdaySelector';

interface SelectorOption {
  label: string;
  value: string;
}

// 源分类项
export interface SourceCategory {
  type_id: string | number;
  type_name: string;
  type_pid?: string | number;
}

interface DoubanSelectorProps {
  type: 'movie' | 'tv' | 'show' | 'anime';
  primarySelection?: string;
  secondarySelection?: string;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
  onMultiLevelChange?: (values: Record<string, string>) => void;
  onWeekdayChange: (weekday: string) => void;
  // 数据源相关 props
  sources?: ApiSite[];
  currentSource?: string;
  sourceCategories?: SourceCategory[];
  isLoadingSources?: boolean;
  isLoadingCategories?: boolean;
  onSourceChange?: (sourceKey: string) => void;
  onSourceCategoryChange?: (category: SourceCategory) => void;
  selectedSourceCategory?: SourceCategory | null;
}

const DoubanSelector: React.FC<DoubanSelectorProps> = ({
  type,
  primarySelection,
  secondarySelection,
  onPrimaryChange,
  onSecondaryChange,
  onMultiLevelChange,
  onWeekdayChange,
  // 数据源相关
  sources = [],
  currentSource = 'auto',
  sourceCategories = [],
  isLoadingSources = false,
  isLoadingCategories = false,
  onSourceChange,
  onSourceCategoryChange,
  selectedSourceCategory,
}) => {
  // 数据源选择器的 refs 和状态
  const sourceContainerRef = useRef<HTMLDivElement>(null);
  const sourceButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sourceIndicatorStyle, setSourceIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  // 源分类选择器的 refs 和状态
  const sourceCategoryContainerRef = useRef<HTMLDivElement>(null);
  const sourceCategoryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sourceCategoryIndicatorStyle, setSourceCategoryIndicatorStyle] =
    useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // 为不同的选择器创建独立的refs和状态
  const primaryContainerRef = useRef<HTMLDivElement>(null);
  const primaryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [primaryIndicatorStyle, setPrimaryIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const secondaryContainerRef = useRef<HTMLDivElement>(null);
  const secondaryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [secondaryIndicatorStyle, setSecondaryIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  // 电影的一级选择器选项
  const moviePrimaryOptions: SelectorOption[] = [
    { label: '全部', value: '全部' },
    { label: '热门电影', value: '热门' },
    { label: '最新电影', value: '最新' },
    { label: '豆瓣高分', value: '豆瓣高分' },
    { label: '冷门佳片', value: '冷门佳片' },
  ];

  // 电影的二级选择器选项
  const movieSecondaryOptions: SelectorOption[] = [
    { label: '全部', value: '全部' },
    { label: '华语', value: '华语' },
    { label: '欧美', value: '欧美' },
    { label: '韩国', value: '韩国' },
    { label: '日本', value: '日本' },
  ];

  // 电视剧一级选择器选项
  const tvPrimaryOptions: SelectorOption[] = [
    { label: '全部', value: '全部' },
    { label: '最近热门', value: '最近热门' },
  ];

  // 电视剧二级选择器选项
  const tvSecondaryOptions: SelectorOption[] = [
    { label: '全部', value: 'tv' },
    { label: '国产', value: 'tv_domestic' },
    { label: '欧美', value: 'tv_american' },
    { label: '日本', value: 'tv_japanese' },
    { label: '韩国', value: 'tv_korean' },
    { label: '动漫', value: 'tv_animation' },
    { label: '纪录片', value: 'tv_documentary' },
  ];

  // 综艺一级选择器选项
  const showPrimaryOptions: SelectorOption[] = [
    { label: '全部', value: '全部' },
    { label: '最近热门', value: '最近热门' },
  ];

  // 综艺二级选择器选项
  const showSecondaryOptions: SelectorOption[] = [
    { label: '全部', value: 'show' },
    { label: '国内', value: 'show_domestic' },
    { label: '国外', value: 'show_foreign' },
  ];

  // 动漫一级选择器选项
  const animePrimaryOptions: SelectorOption[] = [
    { label: '每日放送', value: '每日放送' },
    { label: '番剧', value: '番剧' },
    { label: '剧场版', value: '剧场版' },
  ];

  // 处理多级选择器变化
  const handleMultiLevelChange = (values: Record<string, string>) => {
    onMultiLevelChange?.(values);
  };

  // 更新指示器位置的通用函数
  const updateIndicatorPosition = (
    activeIndex: number,
    containerRef: React.RefObject<HTMLDivElement | null>,
    buttonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
    setIndicatorStyle: React.Dispatch<
      React.SetStateAction<{ left: number; width: number }>
    >,
  ) => {
    if (
      activeIndex >= 0 &&
      buttonRefs.current[activeIndex] &&
      containerRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const button = buttonRefs.current[activeIndex];
        const container = containerRef.current;
        if (button && container) {
          const buttonRect = button.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          if (buttonRect.width > 0) {
            setIndicatorStyle({
              left: buttonRect.left - containerRect.left,
              width: buttonRect.width,
            });
          }
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  };

  // 组件挂载时立即计算初始位置
  useEffect(() => {
    // 主选择器初始位置
    if (type === 'movie') {
      const activeIndex = moviePrimaryOptions.findIndex(
        (opt) =>
          opt.value === (primarySelection || moviePrimaryOptions[0].value),
      );
      updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
    } else if (type === 'tv') {
      const activeIndex = tvPrimaryOptions.findIndex(
        (opt) => opt.value === (primarySelection || tvPrimaryOptions[1].value),
      );
      updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
    } else if (type === 'anime') {
      const activeIndex = animePrimaryOptions.findIndex(
        (opt) =>
          opt.value === (primarySelection || animePrimaryOptions[0].value),
      );
      updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
    } else if (type === 'show') {
      const activeIndex = showPrimaryOptions.findIndex(
        (opt) =>
          opt.value === (primarySelection || showPrimaryOptions[1].value),
      );
      updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
    }

    // 副选择器初始位置
    let secondaryActiveIndex = -1;
    if (type === 'movie') {
      secondaryActiveIndex = movieSecondaryOptions.findIndex(
        (opt) =>
          opt.value === (secondarySelection || movieSecondaryOptions[0].value),
      );
    } else if (type === 'tv') {
      secondaryActiveIndex = tvSecondaryOptions.findIndex(
        (opt) =>
          opt.value === (secondarySelection || tvSecondaryOptions[0].value),
      );
    } else if (type === 'show') {
      secondaryActiveIndex = showSecondaryOptions.findIndex(
        (opt) =>
          opt.value === (secondarySelection || showSecondaryOptions[0].value),
      );
    }

    if (secondaryActiveIndex >= 0) {
      updateIndicatorPosition(
        secondaryActiveIndex,
        secondaryContainerRef,
        secondaryButtonRefs,
        setSecondaryIndicatorStyle,
      );
    }
  }, [type]); // 只在type变化时重新计算

  // 监听主选择器变化
  useEffect(() => {
    if (type === 'movie') {
      const activeIndex = moviePrimaryOptions.findIndex(
        (opt) => opt.value === primarySelection,
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
      return cleanup;
    } else if (type === 'tv') {
      const activeIndex = tvPrimaryOptions.findIndex(
        (opt) => opt.value === primarySelection,
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
      return cleanup;
    } else if (type === 'anime') {
      const activeIndex = animePrimaryOptions.findIndex(
        (opt) => opt.value === primarySelection,
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
      return cleanup;
    } else if (type === 'show') {
      const activeIndex = showPrimaryOptions.findIndex(
        (opt) => opt.value === primarySelection,
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle,
      );
      return cleanup;
    }
  }, [primarySelection]);

  // 监听副选择器变化
  useEffect(() => {
    let activeIndex = -1;
    let options: SelectorOption[] = [];

    if (type === 'movie') {
      activeIndex = movieSecondaryOptions.findIndex(
        (opt) => opt.value === secondarySelection,
      );
      options = movieSecondaryOptions;
    } else if (type === 'tv') {
      activeIndex = tvSecondaryOptions.findIndex(
        (opt) => opt.value === secondarySelection,
      );
      options = tvSecondaryOptions;
    } else if (type === 'show') {
      activeIndex = showSecondaryOptions.findIndex(
        (opt) => opt.value === secondarySelection,
      );
      options = showSecondaryOptions;
    }

    if (options.length > 0) {
      const cleanup = updateIndicatorPosition(
        activeIndex,
        secondaryContainerRef,
        secondaryButtonRefs,
        setSecondaryIndicatorStyle,
      );
      return cleanup;
    }
  }, [secondarySelection]);

  // 渲染胶囊式选择器
  const renderCapsuleSelector = (
    options: SelectorOption[],
    activeValue: string | undefined,
    onChange: (value: string) => void,
    isPrimary = false,
  ) => {
    const containerRef = isPrimary
      ? primaryContainerRef
      : secondaryContainerRef;
    const buttonRefs = isPrimary ? primaryButtonRefs : secondaryButtonRefs;
    const indicatorStyle = isPrimary
      ? primaryIndicatorStyle
      : secondaryIndicatorStyle;

    return (
      <div
        ref={containerRef}
        className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'
      >
        {/* 滑动的白色背景指示器 */}
        {indicatorStyle.width > 0 && (
          <div
            className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
            }}
          />
        )}

        {options.map((option, index) => {
          const isActive = activeValue === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              onClick={() => onChange(option.value)}
              className={`relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'text-gray-900 dark:text-gray-100 cursor-default'
                  : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  // 构建数据源选项（添加"聚合"选项在最前面）
  const sourceOptions: SelectorOption[] = [
    { label: '聚合', value: 'auto' },
    ...sources.map((s) => ({ label: s.name, value: s.key })),
  ];

  // 更新数据源指示器位置
  useEffect(() => {
    const activeIndex = sourceOptions.findIndex(
      (opt) => opt.value === currentSource,
    );
    if (
      activeIndex >= 0 &&
      sourceButtonRefs.current[activeIndex] &&
      sourceContainerRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const button = sourceButtonRefs.current[activeIndex];
        const container = sourceContainerRef.current;
        if (button && container) {
          const buttonRect = button.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (buttonRect.width > 0) {
            setSourceIndicatorStyle({
              left: buttonRect.left - containerRect.left,
              width: buttonRect.width,
            });
          }
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [currentSource, sources]);

  // 更新源分类指示器位置
  useEffect(() => {
    if (sourceCategories.length === 0 || !selectedSourceCategory) return;

    const activeIndex = sourceCategories.findIndex(
      (cat) => cat.type_id === selectedSourceCategory.type_id,
    );
    if (
      activeIndex >= 0 &&
      sourceCategoryButtonRefs.current[activeIndex] &&
      sourceCategoryContainerRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const button = sourceCategoryButtonRefs.current[activeIndex];
        const container = sourceCategoryContainerRef.current;
        if (button && container) {
          const buttonRect = button.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (buttonRect.width > 0) {
            setSourceCategoryIndicatorStyle({
              left: buttonRect.left - containerRect.left,
              width: buttonRect.width,
            });
          }
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedSourceCategory, sourceCategories]);

  // 滚动控制状态
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 检查滚动状态，决定是否显示箭头
  const checkScrollArrows = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftArrow(scrollLeft > 5);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
  }, []);

  // 滚动控制函数
  const scrollSources = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = direction === 'left' ? -200 : 200;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }, []);

  // 监听滚动容器变化
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 初始检查
    checkScrollArrows();

    // 监听滚动事件
    container.addEventListener('scroll', checkScrollArrows);

    // 监听窗口大小变化
    window.addEventListener('resize', checkScrollArrows);

    return () => {
      container.removeEventListener('scroll', checkScrollArrows);
      window.removeEventListener('resize', checkScrollArrows);
    };
  }, [sources, isLoadingSources, checkScrollArrows]);

  // 渲染数据源选择器（横向滚动样式 + 左右箭头控制）
  const renderSourceSelector = () => {
    if (sources.length === 0 && !isLoadingSources) {
      return null;
    }

    return (
      <div className='flex flex-row items-center gap-2'>
        <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 shrink-0 whitespace-nowrap flex items-center gap-1'>
          <Database className='w-3.5 h-3.5' />
          数据源
        </span>
        {/* 滚动容器包装器 - 相对定位用于箭头按钮 */}
        <div className='relative flex-1 min-w-0'>
          {/* 左侧滚动箭头 */}
          {showLeftArrow && (
            <button
              onClick={() => scrollSources('left')}
              className='absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 dark:bg-gray-700/80 shadow-md backdrop-blur-sm border border-gray-200/50 dark:border-gray-600/50 hover:bg-white dark:hover:bg-gray-600 transition-all duration-200'
              aria-label='向左滚动'
            >
              <ChevronLeft className='w-4 h-4 text-gray-600 dark:text-gray-300' />
            </button>
          )}

          {/* 滚动内容区域 */}
          <div
            ref={scrollContainerRef}
            className='overflow-x-auto scrollbar-hide px-1'
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {isLoadingSources ? (
              <div className='flex items-center gap-2 px-3 py-2 text-sm text-gray-500'>
                <Loader2 className='w-4 h-4 animate-spin' />
                <span>加载中...</span>
              </div>
            ) : (
              <div
                ref={sourceContainerRef}
                className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'
              >
                {/* 滑动指示器 */}
                {sourceIndicatorStyle.width > 0 && (
                  <div
                    className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
                    style={{
                      left: `${sourceIndicatorStyle.left}px`,
                      width: `${sourceIndicatorStyle.width}px`,
                    }}
                  />
                )}
                {sourceOptions.map((option, index) => {
                  const isActive = currentSource === option.value;
                  return (
                    <button
                      key={option.value}
                      ref={(el) => {
                        sourceButtonRefs.current[index] = el;
                      }}
                      onClick={() => onSourceChange?.(option.value)}
                      className={`relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                        isActive
                          ? 'text-gray-900 dark:text-gray-100 cursor-default'
                          : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右侧滚动箭头 */}
          {showRightArrow && (
            <button
              onClick={() => scrollSources('right')}
              className='absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 dark:bg-gray-700/80 shadow-md backdrop-blur-sm border border-gray-200/50 dark:border-gray-600/50 hover:bg-white dark:hover:bg-gray-600 transition-all duration-200'
              aria-label='向右滚动'
            >
              <ChevronRight className='w-4 h-4 text-gray-600 dark:text-gray-300' />
            </button>
          )}
        </div>
      </div>
    );
  };

  // 渲染源分类选择器（当选择了特定数据源时显示）
  const renderSourceCategorySelector = () => {
    // 🔥 调试日志
    console.log('🔥 [DoubanSelector] renderSourceCategorySelector called');
    console.log('🔥 [DoubanSelector] currentSource:', currentSource);
    console.log('🔥 [DoubanSelector] sourceCategories:', sourceCategories);
    console.log(
      '🔥 [DoubanSelector] sourceCategories.length:',
      sourceCategories.length,
    );

    if (currentSource === 'auto') {
      console.log('🔥 [DoubanSelector] Skipping: currentSource is auto');
      return null;
    }

    if (sourceCategories.length === 0) {
      console.log('🔥 [DoubanSelector] Skipping: sourceCategories is empty');
      // 显示空状态提示而不是直接返回 null
      return (
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400'>
              {sources.find((s) => s.key === currentSource)?.name || '源'} 分类
            </span>
          </div>
          <div className='text-sm text-gray-500 dark:text-gray-400 py-2'>
            {isLoadingCategories
              ? '加载中...'
              : '该源暂无分类数据（可能受跨域限制）'}
          </div>
        </div>
      );
    }

    console.log(
      '🔥 [DoubanSelector] Rendering categories:',
      sourceCategories.length,
    );

    return (
      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between'>
          <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400'>
            {sources.find((s) => s.key === currentSource)?.name || '源'} 分类
          </span>
          <span className='text-xs text-gray-400 dark:text-gray-500'>
            {sourceCategories.length} 个分类
          </span>
        </div>
        {/* 横向滚动容器 - 支持大量分类显示 */}
        <div className='overflow-x-auto scrollbar-hide -mx-2 px-2'>
          {isLoadingCategories ? (
            <div className='flex items-center gap-2 px-3 py-2 text-sm text-gray-500'>
              <Loader2 className='w-4 h-4 animate-spin' />
              <span>加载分类...</span>
            </div>
          ) : (
            <div
              ref={sourceCategoryContainerRef}
              className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm flex-nowrap'
            >
              {/* 滑动指示器 */}
              {sourceCategoryIndicatorStyle.width > 0 && (
                <div
                  className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
                  style={{
                    left: `${sourceCategoryIndicatorStyle.left}px`,
                    width: `${sourceCategoryIndicatorStyle.width}px`,
                  }}
                />
              )}
              {sourceCategories.map((category, index) => {
                const isActive =
                  selectedSourceCategory?.type_id === category.type_id;
                return (
                  <button
                    key={category.type_id}
                    ref={(el) => {
                      sourceCategoryButtonRefs.current[index] = el;
                    }}
                    onClick={() => onSourceCategoryChange?.(category)}
                    className={`relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'text-gray-900 dark:text-gray-100 cursor-default'
                        : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
                    }`}
                  >
                    {category.type_name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 判断是否使用豆瓣分类（聚合模式）
  const useDoubanCategories = currentSource === 'auto';

  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* 数据源选择器 - 始终在最上方 */}
      {sources.length > 0 && renderSourceSelector()}

      {/* 源分类选择器 - 当选择特定源时显示 */}
      {!useDoubanCategories && renderSourceCategorySelector()}

      {/* === 以下是豆瓣分类（聚合模式时显示）=== */}

      {/* 电影类型 - 显示两级选择器 */}
      {useDoubanCategories && type === 'movie' && (
        <div className='space-y-3 sm:space-y-4'>
          {/* 一级选择器 */}
          <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
              分类
            </span>
            <div className='overflow-x-auto'>
              {renderCapsuleSelector(
                moviePrimaryOptions,
                primarySelection || moviePrimaryOptions[0].value,
                onPrimaryChange,
                true,
              )}
            </div>
          </div>

          {/* 二级选择器 - 只在非"全部"时显示 */}
          {primarySelection !== '全部' ? (
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                地区
              </span>
              <div className='overflow-x-auto'>
                {renderCapsuleSelector(
                  movieSecondaryOptions,
                  secondarySelection || movieSecondaryOptions[0].value,
                  onSecondaryChange,
                  false,
                )}
              </div>
            </div>
          ) : (
            /* 多级选择器 - 只在选中"全部"时显示 */
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                筛选
              </span>
              <div className='overflow-x-auto'>
                <MultiLevelSelector
                  key={`${type}-${primarySelection}`}
                  onChange={handleMultiLevelChange}
                  contentType={type}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 电视剧类型 - 显示两级选择器 */}
      {useDoubanCategories && type === 'tv' && (
        <div className='space-y-3 sm:space-y-4'>
          {/* 一级选择器 */}
          <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
              分类
            </span>
            <div className='overflow-x-auto'>
              {renderCapsuleSelector(
                tvPrimaryOptions,
                primarySelection || tvPrimaryOptions[1].value,
                onPrimaryChange,
                true,
              )}
            </div>
          </div>

          {/* 二级选择器 - 只在选中"最近热门"时显示，选中"全部"时显示多级选择器 */}
          {(primarySelection || tvPrimaryOptions[1].value) === '最近热门' ? (
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                类型
              </span>
              <div className='overflow-x-auto'>
                {renderCapsuleSelector(
                  tvSecondaryOptions,
                  secondarySelection || tvSecondaryOptions[0].value,
                  onSecondaryChange,
                  false,
                )}
              </div>
            </div>
          ) : (primarySelection || tvPrimaryOptions[1].value) === '全部' ? (
            /* 多级选择器 - 只在选中"全部"时显示 */
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                筛选
              </span>
              <div className='overflow-x-auto'>
                <MultiLevelSelector
                  key={`${type}-${primarySelection}`}
                  onChange={handleMultiLevelChange}
                  contentType={type}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* 动漫类型 - 显示一级选择器和多级选择器 */}
      {useDoubanCategories && type === 'anime' && (
        <div className='space-y-3 sm:space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
              分类
            </span>
            <div className='overflow-x-auto'>
              {renderCapsuleSelector(
                animePrimaryOptions,
                primarySelection || animePrimaryOptions[0].value,
                onPrimaryChange,
                true,
              )}
            </div>
          </div>

          {/* 筛选部分 - 根据一级选择器显示不同内容 */}
          {(primarySelection || animePrimaryOptions[0].value) === '每日放送' ? (
            // 每日放送分类下显示星期选择器
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                星期
              </span>
              <div className='overflow-x-auto'>
                <WeekdaySelector onWeekdayChange={onWeekdayChange} />
              </div>
            </div>
          ) : (
            // 其他分类下显示原有的筛选功能
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                筛选
              </span>
              <div className='overflow-x-auto'>
                {(primarySelection || animePrimaryOptions[0].value) ===
                '番剧' ? (
                  <MultiLevelSelector
                    key={`anime-tv-${primarySelection}`}
                    onChange={handleMultiLevelChange}
                    contentType='anime-tv'
                  />
                ) : (
                  <MultiLevelSelector
                    key={`anime-movie-${primarySelection}`}
                    onChange={handleMultiLevelChange}
                    contentType='anime-movie'
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 综艺类型 - 显示两级选择器 */}
      {useDoubanCategories && type === 'show' && (
        <div className='space-y-3 sm:space-y-4'>
          {/* 一级选择器 */}
          <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
              分类
            </span>
            <div className='overflow-x-auto'>
              {renderCapsuleSelector(
                showPrimaryOptions,
                primarySelection || showPrimaryOptions[1].value,
                onPrimaryChange,
                true,
              )}
            </div>
          </div>

          {/* 二级选择器 - 只在选中"最近热门"时显示，选中"全部"时显示多级选择器 */}
          {(primarySelection || showPrimaryOptions[1].value) === '最近热门' ? (
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                类型
              </span>
              <div className='overflow-x-auto'>
                {renderCapsuleSelector(
                  showSecondaryOptions,
                  secondarySelection || showSecondaryOptions[0].value,
                  onSecondaryChange,
                  false,
                )}
              </div>
            </div>
          ) : (primarySelection || showPrimaryOptions[1].value) === '全部' ? (
            /* 多级选择器 - 只在选中"全部"时显示 */
            <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
              <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-12'>
                筛选
              </span>
              <div className='overflow-x-auto'>
                <MultiLevelSelector
                  key={`${type}-${primarySelection}`}
                  onChange={handleMultiLevelChange}
                  contentType={type}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default DoubanSelector;
