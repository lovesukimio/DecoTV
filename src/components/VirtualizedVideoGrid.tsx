'use client';

import { ReactNode } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';

type VirtualizationMode = 'auto' | 'always' | 'never';

interface VirtualizedVideoGridProps<T> {
  data: T[];
  className: string;
  itemClassName?: string;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onEndReached?: (index: number) => void;
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
  mode = 'auto',
  virtualizationThreshold = 120,
  overscan = 560,
}: VirtualizedVideoGridProps<T>) {
  const shouldVirtualize =
    mode === 'always' ||
    (mode === 'auto' && data.length >= virtualizationThreshold);

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
        top: reverseOverscan,
        bottom: Math.max(Math.round(overscan * 1.2), 760),
      }}
      computeItemKey={(index, item) => itemKey(item, index)}
      itemContent={(index, item) => renderItem(item, index)}
      endReached={onEndReached}
    />
  );
}
