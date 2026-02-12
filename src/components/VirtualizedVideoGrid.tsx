'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';

import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

type VirtualizationMode = 'auto' | 'always' | 'never';

interface VirtualizedVideoGridProps<T> {
  data: T[];
  className: string;
  itemClassName?: string;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onEndReached?: (index: number) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  mode?: VirtualizationMode;
  virtualizationThreshold?: number;
  overscan?: number;
  minVirtualHeight?: number;
  viewportOffset?: number;
}

export default function VirtualizedVideoGrid<T>({
  data,
  className,
  itemClassName = 'w-full',
  itemKey,
  renderItem,
  onEndReached,
  hasMore = true,
  isLoadingMore = false,
  mode = 'auto',
  virtualizationThreshold = 120,
  overscan = 560,
  minVirtualHeight = 480,
  viewportOffset = 220,
}: VirtualizedVideoGridProps<T>) {
  const shouldVirtualize =
    mode === 'always' ||
    (mode === 'auto' && data.length >= virtualizationThreshold);
  const [virtualHeight, setVirtualHeight] = useState(minVirtualHeight);
  const [scrollerElement, setScrollerElement] = useState<HTMLElement | null>(
    null,
  );

  const updateVirtualHeight = useCallback(() => {
    if (typeof window === 'undefined') return;
    const nextHeight = Math.max(
      minVirtualHeight,
      window.innerHeight - viewportOffset,
    );
    setVirtualHeight(nextHeight);
  }, [minVirtualHeight, viewportOffset]);

  useEffect(() => {
    if (!shouldVirtualize) return;

    updateVirtualHeight();
    window.addEventListener('resize', updateVirtualHeight, { passive: true });
    window.addEventListener('orientationchange', updateVirtualHeight);

    return () => {
      window.removeEventListener('resize', updateVirtualHeight);
      window.removeEventListener('orientationchange', updateVirtualHeight);
    };
  }, [shouldVirtualize, updateVirtualHeight]);

  const canLoadMore = Boolean(onEndReached) && hasMore && !isLoadingMore;

  const handleLoadMore = useCallback(() => {
    if (!onEndReached) return;
    if (data.length === 0) return;
    onEndReached(data.length - 1);
  }, [data.length, onEndReached]);

  const { sentinelRef } = useInfiniteScroll({
    enabled: shouldVirtualize && canLoadMore,
    hasMore,
    isLoading: isLoadingMore,
    root: scrollerElement,
    rootMargin: '300px 0px',
    threshold: 0.01,
    onLoadMore: handleLoadMore,
  });

  if (!shouldVirtualize) {
    return (
      <div className={className}>
        {data.map((item, index) => (
          <div
            key={itemKey(item, index)}
            className={itemClassName}
            style={{
              contentVisibility: 'auto',
              containIntrinsicSize: '360px',
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  const reverseOverscan = Math.max(Math.round(overscan * 1.8), 960);
  const mainOverscan = Math.max(overscan, 720);
  const listFooter = () =>
    canLoadMore ? <div ref={sentinelRef} className='h-2 w-full' /> : null;

  return (
    <div
      className='w-full'
      style={{
        height: `${virtualHeight}px`,
        minHeight: `${minVirtualHeight}px`,
      }}
    >
      <VirtuosoGrid
        data={data}
        style={{ height: '100%' }}
        listClassName={className}
        itemClassName={itemClassName}
        overscan={{ main: mainOverscan, reverse: reverseOverscan }}
        increaseViewportBy={{
          top: reverseOverscan,
          bottom: Math.max(Math.round(overscan * 1.2), 760),
        }}
        components={{ Footer: listFooter }}
        scrollerRef={(el) => setScrollerElement(el)}
        computeItemKey={(index, item) => itemKey(item, index)}
        itemContent={(index, item) => renderItem(item, index)}
      />
    </div>
  );
}
