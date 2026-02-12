'use client';

import { ReactNode, useCallback } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';

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
}: VirtualizedVideoGridProps<T>) {
  const shouldVirtualize =
    mode === 'always' ||
    (mode === 'auto' && data.length >= virtualizationThreshold);

  const canLoadMore = Boolean(onEndReached) && hasMore && !isLoadingMore;

  const handleEndReached = useCallback(
    (index: number) => {
      if (!onEndReached) return;
      if (!canLoadMore || data.length === 0) return;
      onEndReached(index);
    },
    [onEndReached, canLoadMore, data.length],
  );

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

  return (
    <VirtuosoGrid
      useWindowScroll
      data={data}
      listClassName={className}
      itemClassName={itemClassName}
      overscan={{ main: mainOverscan, reverse: reverseOverscan }}
      increaseViewportBy={{
        top: Math.max(Math.round(overscan * 1.1), 640),
        bottom: Math.max(Math.round(overscan * 1.6), 960),
      }}
      computeItemKey={(index, item) => itemKey(item, index)}
      itemContent={(index, item) => renderItem(item, index)}
      endReached={handleEndReached}
    />
  );
}
