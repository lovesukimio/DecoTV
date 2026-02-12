'use client';

import { ReactNode } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';

interface VirtualizedVideoGridProps<T> {
  data: T[];
  className: string;
  itemClassName?: string;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  virtualizationThreshold?: number;
  overscan?: number;
}

export default function VirtualizedVideoGrid<T>({
  data,
  className,
  itemClassName = 'w-full',
  itemKey,
  renderItem,
  virtualizationThreshold = 40,
  overscan = 320,
}: VirtualizedVideoGridProps<T>) {
  const shouldVirtualize = data.length >= virtualizationThreshold;

  if (!shouldVirtualize) {
    return (
      <div className={className}>
        {data.map((item, index) => (
          <div key={itemKey(item, index)} className={itemClassName}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <VirtuosoGrid
      useWindowScroll
      data={data}
      listClassName={className}
      itemClassName={itemClassName}
      overscan={overscan}
      increaseViewportBy={overscan}
      computeItemKey={(index, item) => itemKey(item, index)}
      itemContent={(index, item) => renderItem(item, index)}
    />
  );
}
