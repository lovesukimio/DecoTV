'use client';

import { ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

// 简单的 className 合并函数
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface CategoryBarProps {
  /** 分组数据: { 分组名: 频道数组 } */
  groupedChannels: { [key: string]: unknown[] };
  /** 当前选中的分组 */
  selectedGroup: string;
  /** 切换分组回调 */
  onGroupChange: (group: string) => void;
  /** 打开分组选择器弹窗回调 */
  onOpenSelector?: () => void;
  /** 是否禁用（切换直播源时） */
  disabled?: boolean;
  /** 禁用时的提示文字 */
  disabledMessage?: string;
}

/**
 * 直播频道分类选择器组件
 * - 强制单行显示，支持横向滚动
 * - 移动端：隐藏滚动条，手指滑屏
 * - PC 端：隐藏滚动条，两侧箭头控制
 */
export default function CategoryBar({
  groupedChannels,
  selectedGroup,
  onGroupChange,
  onOpenSelector,
  disabled = false,
  disabledMessage = '切换直播源中...',
}: CategoryBarProps) {
  // 滚动容器引用
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 分组按钮引用数组
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 箭头显示状态
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // 滚动距离（每次点击箭头滚动的像素）
  const SCROLL_DISTANCE = 200;

  // 获取分组列表
  const groups = Object.keys(groupedChannels);

  /**
   * 更新箭头显示状态
   */
  const updateArrowVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    // 左箭头：有可滚动的距离时显示
    setShowLeftArrow(scrollLeft > 1);
    // 右箭头：未滚动到底部时显示
    setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  /**
   * 滚动到指定方向
   */
  const handleScroll = useCallback(
    (direction: 'left' | 'right') => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollAmount =
        direction === 'left' ? -SCROLL_DISTANCE : SCROLL_DISTANCE;
      container.scrollBy({
        left: scrollAmount,
        behavior: 'smooth',
      });
    },
    [SCROLL_DISTANCE],
  );

  /**
   * 将选中的分组滚动到视口中央
   */
  const scrollToActiveGroup = useCallback(() => {
    if (!selectedGroup) return;

    const groupIndex = groups.indexOf(selectedGroup);
    if (groupIndex === -1) return;

    const button = buttonRefs.current[groupIndex];
    if (!button) return;

    // 使用 scrollIntoView 让选中的胶囊自动滚动到可视区域中央
    button.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedGroup, groups]);

  // 初始化和窗口尺寸变化时更新箭头状态
  useLayoutEffect(() => {
    updateArrowVisibility();
  }, [updateArrowVisibility, groupedChannels]);

  // 监听滚动事件
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', updateArrowVisibility, {
      passive: true,
    });
    window.addEventListener('resize', updateArrowVisibility);

    return () => {
      container.removeEventListener('scroll', updateArrowVisibility);
      window.removeEventListener('resize', updateArrowVisibility);
    };
  }, [updateArrowVisibility]);

  // 当选中分组变化时，滚动到对应位置
  useEffect(() => {
    scrollToActiveGroup();
  }, [selectedGroup, scrollToActiveGroup]);

  // 如果没有分组，不渲染
  if (groups.length === 0) return null;

  return (
    <div className='mb-3 shrink-0 -mx-6'>
      {/* 禁用状态提示 */}
      {disabled && disabledMessage && (
        <div className='flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 px-6 pb-2'>
          <div className='w-2 h-2 bg-amber-500 rounded-full animate-pulse' />
          {disabledMessage}
        </div>
      )}

      {/* 分类选择器容器 */}
      <div className='relative flex items-center gap-2 px-6 pb-3'>
        {/* "全部分类"按钮 */}
        {onOpenSelector && (
          <button
            onClick={onOpenSelector}
            disabled={disabled}
            className={`shrink-0 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 border-2 ${
              disabled
                ? 'opacity-50 cursor-not-allowed border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400'
                : 'border-green-500 dark:border-green-400 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
            title='查看全部分类'
          >
            <div className='flex items-center gap-1.5'>
              <Menu className='w-4 h-4' />
              <span>全部分类</span>
              <span className='text-xs opacity-75'>({groups.length})</span>
            </div>
          </button>
        )}

        {/* 分组标签滚动容器 */}
        <div className='relative flex-1 min-w-0'>
          {/* 左侧箭头 - 仅 PC 端显示 */}
          <button
            onClick={() => handleScroll('left')}
            className={cn(
              'hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10',
              'w-8 h-8 items-center justify-center',
              'rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm',
              'border border-gray-200 dark:border-gray-700',
              'shadow-lg hover:shadow-xl',
              'text-gray-600 dark:text-gray-300',
              'hover:bg-white dark:hover:bg-gray-700',
              'transition-all duration-200',
              showLeftArrow
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none',
            )}
            aria-label='向左滚动'
          >
            <ChevronLeft className='w-5 h-5' />
          </button>

          {/* 右侧箭头 - 仅 PC 端显示 */}
          <button
            onClick={() => handleScroll('right')}
            className={cn(
              'hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10',
              'w-8 h-8 items-center justify-center',
              'rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm',
              'border border-gray-200 dark:border-gray-700',
              'shadow-lg hover:shadow-xl',
              'text-gray-600 dark:text-gray-300',
              'hover:bg-white dark:hover:bg-gray-700',
              'transition-all duration-200',
              showRightArrow
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none',
            )}
            aria-label='向右滚动'
          >
            <ChevronRight className='w-5 h-5' />
          </button>

          {/* 左侧渐变遮罩 - 仅 PC 端显示 */}
          <div
            className={cn(
              'hidden lg:block absolute left-0 top-0 bottom-0 w-10 z-5',
              'bg-linear-to-r from-gray-50 dark:from-gray-900 to-transparent',
              'pointer-events-none transition-opacity duration-200',
              showLeftArrow ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* 右侧渐变遮罩 - 仅 PC 端显示 */}
          <div
            className={cn(
              'hidden lg:block absolute right-0 top-0 bottom-0 w-10 z-5',
              'bg-linear-to-l from-gray-50 dark:from-gray-900 to-transparent',
              'pointer-events-none transition-opacity duration-200',
              showRightArrow ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* 横向滚动的分类标签列表 */}
          <div
            ref={scrollContainerRef}
            className='flex gap-2 overflow-x-auto lg:px-6 scrollbar-hide'
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* 隐藏 Webkit 滚动条的样式 */}
            <style jsx>{`
              .scrollbar-hide::-webkit-scrollbar {
                display: none;
              }
            `}</style>

            {groups.map((group, index) => {
              const isActive = group === selectedGroup;
              const channelCount = groupedChannels[group].length;

              return (
                <button
                  key={group}
                  data-group={group}
                  ref={(el) => {
                    buttonRefs.current[index] = el;
                  }}
                  onClick={() => onGroupChange(group)}
                  disabled={disabled}
                  className={cn(
                    'shrink-0 px-4 py-2 rounded-full text-sm font-medium',
                    'transition-all duration-200 whitespace-nowrap',
                    'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1',
                    disabled && 'opacity-50 cursor-not-allowed',
                    !disabled &&
                      isActive &&
                      'bg-green-500 text-white shadow-lg shadow-green-500/30 scale-105',
                    !disabled &&
                      !isActive &&
                      'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-102 active:scale-98',
                  )}
                >
                  {group}
                  <span
                    className={cn(
                      'ml-1.5 text-xs',
                      isActive
                        ? 'text-white/80'
                        : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    ({channelCount})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
